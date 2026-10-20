import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { abuseClaims } from "@/lib/db/schema";

/**
 * Free-tier abuse protection.
 *
 * - Public quick scan: ONE free scan per (IP + device signal), enforced
 *   server-side in the database — clearing cookies/site data does not
 *   reset it. After that, people sign up for the free plan.
 * - Signup: one account per (IP + device signal) per 30 days, to make
 *   mass free-account farming impractical.
 *
 * Only SHA-256 hashes are stored (never raw IPs). Determined attackers
 * with fresh IPs and browsers can still get through — this stops
 * casual repeat abuse, which is the realistic threat at this stage,
 * and the per-IP rate limits remain as a second layer.
 *
 * Behavior is deliberately NOT advertised on the website; users just
 * see a friendly "create a free account" message.
 *
 * Fails OPEN if the database is unavailable: availability of the
 * scanner matters more than gating, and rate limits still apply.
 */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function claimHash(ip: string, device: string | null | undefined): string {
  return sha256(`${ip.trim()}|${(device ?? "").trim()}`);
}

function publicScanLimit(): number {
  const raw = Number.parseInt(process.env.CLYVRO_PUBLIC_SCAN_LIMIT ?? "1", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

/** Consumes one free public scan for this claim. Returns false when the free scan is used up. */
export async function tryConsumePublicScan(ip: string, device: string | null | undefined, dbOverride?: DB): Promise<boolean> {
  const limit = publicScanLimit();
  if (limit === 0) return true; // unlimited (local development/testing)
  try {
    const db = dbOverride ?? (await getDb());
    const hash = claimHash(ip, device);
    return await db.transaction(async (tx) => {
      const [row] = await tx.select().from(abuseClaims)
        .where(and(eq(abuseClaims.kind, "public-scan"), eq(abuseClaims.claimHash, hash))).limit(1);
      if (!row) {
        await tx.insert(abuseClaims).values({ id: newId(), kind: "public-scan", claimHash: hash, count: 1 });
        return true;
      }
      if (row.count >= limit) return false;
      await tx.update(abuseClaims).set({ count: row.count + 1, lastSeenAt: new Date() }).where(eq(abuseClaims.id, row.id));
      return true;
    });
  } catch (err) {
    console.error("[abuse] public-scan claim check failed; allowing with rate limits only", err);
    return true;
  }
}

/** True when a signup from this claim is allowed (no account created from it in the last 30 days). */
export async function signupAllowed(ip: string, device: string | null | undefined, dbOverride?: DB): Promise<boolean> {
  try {
    const db = dbOverride ?? (await getDb());
    const hash = claimHash(ip, device);
    const [row] = await db.select().from(abuseClaims)
      .where(and(eq(abuseClaims.kind, "signup"), eq(abuseClaims.claimHash, hash))).limit(1);
    if (!row) return true;
    return Date.now() - row.lastSeenAt.getTime() > 30 * 24 * 60 * 60 * 1000;
  } catch {
    return true; // fail open; email uniqueness + rate limits still apply
  }
}

export async function recordSignup(ip: string, device: string | null | undefined, dbOverride?: DB): Promise<void> {
  try {
    const db = dbOverride ?? (await getDb());
    const hash = claimHash(ip, device);
    const [row] = await db.select().from(abuseClaims)
      .where(and(eq(abuseClaims.kind, "signup"), eq(abuseClaims.claimHash, hash))).limit(1);
    if (row) {
      await db.update(abuseClaims).set({ count: row.count + 1, lastSeenAt: new Date() }).where(eq(abuseClaims.id, row.id));
    } else {
      await db.insert(abuseClaims).values({ id: newId(), kind: "signup", claimHash: hash, count: 1 });
    }
  } catch {
    // best-effort only
  }
}
