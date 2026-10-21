import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, count } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { securityEvents, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/passwords";
import { createBridgeToken } from "@/lib/firebase-auth";
import { maskIp } from "@/lib/shield/rules";
import { TRUST_COOKIE, TRUST_TTL_MS, issueTrustToken, verifyTrustToken, type TrustClaims } from "@/lib/shield/trust";
import { ADMIN_EMAILS } from "@/lib/services/admin";
import { accountKey, getShieldSettings, ipKey, recordEvent, shieldSecret, unbanKey } from "@/lib/services/shield";
import { ScanError } from "@/lib/scanner/types";

/**
 * Trusted administrator browsers + the hidden emergency door.
 *
 * Why: Shield's IP allowlist is brittle (mobile data, VPNs, office/home
 * switches). A signed cookie that says "this browser belongs to an admin"
 * follows the person, not the network, and Shield lets it through
 * regardless of bans or rate limits. The emergency door issues the same
 * cookie *before* sign-in so the founder can always get back in, even
 * while their address is banned or Under-attack mode is on.
 */

export { TRUST_COOKIE };

/** Non-reversible short user reference stored inside the token. */
export function trustSubject(userId: string): string {
  return createHash("sha256").update(`trust|${userId}`).digest("base64url").slice(0, 16);
}

export interface TrustCookie { name: string; value: string; expires: Date; maxAge: number }

export async function mintTrustCookie(userId: string, dbOverride?: DB, now = Date.now()): Promise<TrustCookie> {
  const settings = await getShieldSettings(dbOverride, true);
  const exp = now + TRUST_TTL_MS;
  const value = await issueTrustToken(shieldSecret(), { uid: trustSubject(userId), exp, v: settings.trustVersion });
  return { name: TRUST_COOKIE, value, expires: new Date(exp), maxAge: Math.floor(TRUST_TTL_MS / 1000) };
}

export function trustCookieAttributes(): { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/" } {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };
}

/** Verifies a cookie value for display ("this browser is trusted until …") and for the current user only. */
export async function inspectTrustCookie(value: string | undefined, userId: string, dbOverride?: DB): Promise<TrustClaims | null> {
  if (!value) return null;
  const settings = await getShieldSettings(dbOverride, true);
  const claims = await verifyTrustToken(value, shieldSecret(), settings.trustVersion);
  if (!claims || claims.uid !== trustSubject(userId)) return null;
  return claims;
}

/* ------------------------------------------------------------------ */
/* Emergency door                                                       */
/* ------------------------------------------------------------------ */
export const EMERGENCY_LIMITS = {
  /** Failed attempts per address per 15 minutes before the door closes for that address. */
  perIp: 5,
  /**
   * Failed attempts per account per 15 minutes (any address) before the
   * PASSWORD path closes. The emergency-key path stays open (the key is
   * long and random, so it cannot be guessed at 5 tries per address) —
   * otherwise anyone could lock the founder out by spamming their email.
   */
  perAccount: 10,
  windowMs: 15 * 60_000,
};

const GENERIC = "Those details were not accepted.";

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** The optional second factor: a long random string set as ADMIN_EMERGENCY_KEY in Vercel. */
export function emergencyKeyConfigured(): boolean {
  return (process.env.ADMIN_EMERGENCY_KEY ?? "").trim().length >= 16;
}

export interface EmergencyInput { email: string; password: string; key: string; ip: string; userAgent: string | null }
export interface EmergencyResult { userId: string; email: string; bridgeToken: string; cookie: TrustCookie; unbannedIp: boolean }

async function recentEmergencyFailures(db: DB, column: "ip" | "subject", key: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - EMERGENCY_LIMITS.windowMs);
  const where = column === "ip" ? eq(securityEvents.ipHash, key) : eq(securityEvents.subject, key);
  const [row] = await db.select({ n: count() }).from(securityEvents)
    .where(and(where, eq(securityEvents.rule, "emergency"), eq(securityEvents.verdict, "login-failed"), gt(securityEvents.createdAt, since)));
  return Number(row?.n ?? 0);
}

/**
 * Verifies an emergency sign-in. Accepts a platform administrator who
 * proves identity with their password OR the ADMIN_EMERGENCY_KEY (for
 * Google-only accounts). Every attempt is written to the security log;
 * failures count towards the normal account lockout and a stricter
 * emergency throttle. Non-admins get the same generic error as a wrong
 * password so the door reveals nothing.
 */
export async function emergencyLogin(input: EmergencyInput, dbOverride?: DB, now = new Date()): Promise<EmergencyResult> {
  const db = dbOverride ?? (await getDb());
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new ScanError("VALIDATION", "Enter the administrator email address.");
  if (!input.password && !input.key) throw new ScanError("VALIDATION", "Enter your password or the emergency key.");

  const ipHash = await ipKey(input.ip);
  const ipMasked = maskIp(input.ip);
  const subject = await accountKey(email);
  const base = { ipHash, ipMasked, method: "POST", path: "/api/emergency/login", userAgent: input.userAgent, rule: "emergency", mode: "monitor" as const, subject };

  // The door keeps its own counters and deliberately ignores the normal
  // account lockout: an attacker who locks the founder's account from the
  // sign-in page must not be able to lock the emergency door too.
  const [byIp, byAccount] = await Promise.all([
    recentEmergencyFailures(db, "ip", ipHash, now),
    recentEmergencyFailures(db, "subject", subject, now),
  ]);
  if (byIp >= EMERGENCY_LIMITS.perIp) {
    await recordEvent({ ...base, verdict: "rate-limited", score: byIp }, db);
    throw new ScanError("RATE_LIMITED", "Too many emergency attempts from this address. Wait 15 minutes and try again.");
  }
  const passwordPathOpen = byAccount < EMERGENCY_LIMITS.perAccount;

  const fail = async () => {
    await recordEvent({ ...base, verdict: "login-failed" }, db);
    throw new ScanError("FORBIDDEN", GENERIC);
  };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.suspendedAt) return fail();
  const isAdmin = user.isPlatformAdmin || ADMIN_EMAILS.includes(email);
  if (!isAdmin) return fail();

  let proven = false;
  if (input.key && emergencyKeyConfigured() && constantTimeEqual(input.key, (process.env.ADMIN_EMERGENCY_KEY ?? "").trim())) proven = true;
  if (!proven && input.password && user.passwordHash && verifyPassword(input.password, user.passwordHash)) {
    if (!passwordPathOpen) {
      await recordEvent({ ...base, verdict: "rate-limited", score: byAccount }, db);
      throw new ScanError("RATE_LIMITED", emergencyKeyConfigured()
        ? "Too many password attempts for this account in the last 15 minutes — use the emergency key instead."
        : "Too many password attempts for this account in the last 15 minutes. Wait and try again.");
    }
    proven = true;
  }
  if (!proven) return fail();

  // Success: lift any ban on the address they are using right now, mint the
  // trusted-browser cookie, and hand back a bridge token for the session.
  const unbannedIp = await unbanKey(`ip:${ipHash}`, db);
  const cookie = await mintTrustCookie(user.id, db, now.getTime());
  await recordEvent({ ...base, verdict: "emergency", score: 0 }, db);
  return { userId: user.id, email: user.email, bridgeToken: createBridgeToken(user.id, user.email, now.getTime()), cookie, unbannedIp };
}
