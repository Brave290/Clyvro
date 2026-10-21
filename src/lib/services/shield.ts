/**
 * Clyvro Shield — Node side: settings, event recording, the escalation
 * ladder, bans, login lockouts and the queries behind Admin → Security.
 *
 * Privacy: addresses and accounts are stored only as salted SHA-256
 * hashes plus a masked label (`102.89.x.x`, `jo***@example.com`).
 * Resilience: every write path swallows database errors — a Shield
 * hiccup must never turn into a 500 for a visitor.
 */
import { and, count, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { securityBans, securityEvents, siteSettings } from "@/lib/db/schema";
import { logAdmin, type AdminActor } from "@/lib/services/admin";
import {
  RULE_CATALOGUE, SHIELD_MODES, hashAccount, hashIp, internalToken, maskIp,
  type Match, type ShieldMode,
} from "@/lib/shield/rules";

export type { ShieldMode };

/* ------------------------------------------------------------------ */
/* Secret + hashing                                                     */
/* ------------------------------------------------------------------ */
export function shieldSecret(): string {
  return process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me";
}
export const ipKey = (ip: string) => hashIp(ip, shieldSecret());
export const accountKey = (email: string) => hashAccount(email, shieldSecret());
export const shieldToken = () => internalToken(shieldSecret());

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.toLowerCase().split("@");
  return `${user.slice(0, 2)}***@${domain || "?"}`;
}

/* ------------------------------------------------------------------ */
/* Settings (site_settings key "shield")                                */
/* ------------------------------------------------------------------ */
export interface AllowEntry { hash: string; label: string; note: string; addedAt: string }
export interface ShieldSettings { mode: ShieldMode; allow: AllowEntry[] }

export const DEFAULT_SHIELD_SETTINGS: ShieldSettings = { mode: "monitor", allow: [] };
const SETTINGS_KEY = "shield";
let settingsCache: { value: ShieldSettings; at: number } | null = null;
const SETTINGS_CACHE_MS = 5_000;

export function parseShieldSettings(raw: unknown): ShieldSettings {
  const r = (raw ?? {}) as Partial<{ mode: unknown; allow: unknown }>;
  const mode = SHIELD_MODES.includes(r.mode as ShieldMode) ? (r.mode as ShieldMode) : "monitor";
  const allow: AllowEntry[] = Array.isArray(r.allow)
    ? r.allow
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as { hash?: unknown }).hash === "string")
      .slice(0, 50)
      .map((e) => ({
        hash: String(e.hash),
        label: typeof e.label === "string" ? e.label.slice(0, 60) : "?",
        note: typeof e.note === "string" ? e.note.slice(0, 80) : "",
        addedAt: typeof e.addedAt === "string" ? e.addedAt : new Date(0).toISOString(),
      }))
    : [];
  return { mode, allow };
}

export async function getShieldSettings(dbOverride?: DB, fresh = false): Promise<ShieldSettings> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) return settingsCache.value;
  try {
    const db = dbOverride ?? (await getDb());
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, SETTINGS_KEY)).limit(1);
    const value = parseShieldSettings(row?.value);
    settingsCache = { value, at: Date.now() };
    return value;
  } catch {
    return settingsCache?.value ?? DEFAULT_SHIELD_SETTINGS;
  }
}

async function saveShieldSettings(db: DB, actor: AdminActor, value: ShieldSettings) {
  await db.insert(siteSettings)
    .values({ key: SETTINGS_KEY, value, updatedBy: actor.email, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.email, updatedAt: new Date() } });
  settingsCache = { value, at: Date.now() };
}

export async function setShieldMode(actor: AdminActor, mode: ShieldMode, dbOverride?: DB) {
  if (!SHIELD_MODES.includes(mode)) throw new Error("Unknown Shield mode.");
  const db = dbOverride ?? (await getDb());
  const current = await getShieldSettings(db, true);
  const value = { ...current, mode };
  await saveShieldSettings(db, actor, value);
  await logAdmin(db, actor, "shield.mode", "site", "shield", { mode });
  return value;
}

export async function allowIp(actor: AdminActor, ip: string, note: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const current = await getShieldSettings(db, true);
  const hash = await ipKey(ip);
  const allow = current.allow.filter((e) => e.hash !== hash);
  allow.push({ hash, label: maskIp(ip), note: note.slice(0, 80), addedAt: new Date().toISOString() });
  const value = { ...current, allow };
  await saveShieldSettings(db, actor, value);
  // An allowlisted address should not stay banned.
  await db.delete(securityBans).where(eq(securityBans.key, `ip:${hash}`)).catch(() => undefined);
  await logAdmin(db, actor, "shield.allow", "ip", hash.slice(0, 12), { label: maskIp(ip), note });
  return value;
}

export async function unallowIp(actor: AdminActor, hash: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const current = await getShieldSettings(db, true);
  const value = { ...current, allow: current.allow.filter((e) => e.hash !== hash) };
  await saveShieldSettings(db, actor, value);
  await logAdmin(db, actor, "shield.unallow", "ip", hash.slice(0, 12));
  return value;
}

/* ------------------------------------------------------------------ */
/* Events                                                               */
/* ------------------------------------------------------------------ */
export type EventVerdict = "blocked" | "monitored" | "suspicious" | "banned" | "rate-limited" | "login-failed" | "login-locked";

export interface ShieldEventInput {
  ipHash: string;
  ipMasked: string;
  country?: string | null;
  method: string;
  path: string;
  userAgent?: string | null;
  verdict: EventVerdict;
  rule: string;
  matches?: Match[] | null;
  score?: number;
  mode: ShieldMode;
  subject?: string | null;
}

export async function recordEvent(input: ShieldEventInput, dbOverride?: DB): Promise<void> {
  try {
    const db = dbOverride ?? (await getDb());
    await db.insert(securityEvents).values({
      id: newId(),
      ipHash: input.ipHash,
      ipMasked: input.ipMasked.slice(0, 40),
      country: input.country?.slice(0, 8) ?? null,
      method: input.method.slice(0, 10),
      path: input.path.slice(0, 400),
      userAgent: input.userAgent?.slice(0, 200) ?? null,
      verdict: input.verdict,
      rule: input.rule.slice(0, 40),
      matches: input.matches ?? null,
      score: input.score ?? 0,
      mode: input.mode,
      subject: input.subject ?? null,
    });
  } catch {
    /* never fail a request because logging failed */
  }
}

/* ------------------------------------------------------------------ */
/* Bans + escalation ladder                                             */
/* ------------------------------------------------------------------ */
export const BAN_LEVELS: { level: number; minutes: number; label: string }[] = [
  { level: 1, minutes: 15, label: "15 minutes" },
  { level: 2, minutes: 60, label: "1 hour" },
  { level: 3, minutes: 24 * 60, label: "24 hours" },
  { level: 4, minutes: 7 * 24 * 60, label: "7 days" },
];

/** Blocks in the last 24 h → ban level. */
export const ESCALATION: { blocks: number; level: number }[] = [
  { blocks: 60, level: 4 },
  { blocks: 25, level: 3 },
  { blocks: 10, level: 2 },
  { blocks: 4, level: 1 },
];

/** Some reasons start higher on the ladder regardless of history. */
export function floorLevelFor(reason: string): number {
  if (reason === "honeypot" || reason === "null-byte") return 3;
  if (reason === "scanner-ua") return 2;
  return 0;
}

export function ladderLevel(blocksLast24h: number, reason: string): number {
  const byHistory = ESCALATION.find((e) => blocksLast24h >= e.blocks)?.level ?? 0;
  return Math.max(byHistory, floorLevelFor(reason));
}

/**
 * Floods are judged separately and more gently: rate-limited hits are
 * *sampled* (about one event per 30 s per address, see /api/shield/blocked),
 * so 10 samples ≈ 5 minutes of sustained flooding → 15 min ban, 40 ≈ 20+
 * minutes → 1 h. A legitimate runaway script gets 429s first, then a short
 * cool-off — never the 24 h rung reserved for attack signatures.
 */
export const FLOOD_LADDER: { samples: number; level: number }[] = [
  { samples: 40, level: 2 },
  { samples: 10, level: 1 },
];

export function floodLevel(rateLimitedSamplesLast24h: number): number {
  return FLOOD_LADDER.find((e) => rateLimitedSamplesLast24h >= e.samples)?.level ?? 0;
}

export async function upsertBan(
  db: DB,
  ban: { key: string; kind: "ip" | "account"; label: string; reason: string; level: number; createdBy?: string; minutes?: number },
  now = new Date(),
) {
  const level = Math.min(Math.max(ban.level, 1), BAN_LEVELS.length);
  const minutes = ban.minutes ?? BAN_LEVELS[level - 1]!.minutes;
  const expiresAt = new Date(now.getTime() + minutes * 60_000);
  const [existing] = await db.select().from(securityBans).where(eq(securityBans.key, ban.key)).limit(1);
  if (existing && existing.expiresAt > now && existing.level >= level && existing.expiresAt >= expiresAt) {
    await db.update(securityBans).set({ hits: existing.hits + 1, updatedAt: now }).where(eq(securityBans.key, ban.key));
    return { ...existing, hits: existing.hits + 1 };
  }
  const values = {
    key: ban.key, kind: ban.kind, label: ban.label.slice(0, 60), reason: ban.reason.slice(0, 80),
    level, hits: (existing?.hits ?? 0) + 1, expiresAt, createdBy: ban.createdBy ?? "shield", createdAt: now, updatedAt: now,
  };
  await db.insert(securityBans).values(values).onConflictDoUpdate({
    target: securityBans.key,
    set: { kind: values.kind, label: values.label, reason: values.reason, level, hits: values.hits, expiresAt, createdBy: values.createdBy, updatedAt: now },
  });
  return values;
}

/**
 * Called for every enforced block. Counts this address's blocks in the
 * last 24 h and places it on the ladder. Returns the ban applied, if any.
 */
export async function escalate(
  ipHash: string, ipMasked: string, reason: string, dbOverride?: DB, now = new Date(),
): Promise<{ level: number; expiresAt: Date } | null> {
  try {
    const db = dbOverride ?? (await getDb());
    const since = new Date(now.getTime() - 24 * 60 * 60_000);
    const rows = await db.select({ verdict: securityEvents.verdict, n: count() }).from(securityEvents)
      .where(and(
        eq(securityEvents.ipHash, ipHash),
        gt(securityEvents.createdAt, since),
        inArray(securityEvents.verdict, ["blocked", "rate-limited"]),
      ))
      .groupBy(securityEvents.verdict);
    const n = (verdict: string) => Number(rows.find((r) => r.verdict === verdict)?.n ?? 0);
    const level = Math.max(ladderLevel(n("blocked"), reason), floodLevel(n("rate-limited")));
    if (level === 0) return null;
    const ban = await upsertBan(db, { key: `ip:${ipHash}`, kind: "ip", label: ipMasked, reason, level }, now);
    return { level: ban.level, expiresAt: ban.expiresAt };
  } catch {
    return null;
  }
}

export async function activeBanKeys(dbOverride?: DB, now = new Date()): Promise<{ ips: string[]; accounts: string[] }> {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select({ key: securityBans.key }).from(securityBans)
    .where(gt(securityBans.expiresAt, now)).orderBy(desc(securityBans.updatedAt)).limit(2_000);
  const ips: string[] = [];
  const accounts: string[] = [];
  for (const r of rows) {
    const [kind, hash] = r.key.split(":", 2);
    if (kind === "ip" && hash) ips.push(hash);
    else if (kind === "account" && hash) accounts.push(hash);
  }
  return { ips, accounts };
}

/** Manual ban by raw address (typed by the admin) or by the hash shown next to an event. */
export async function banIp(
  actor: AdminActor, target: { ip?: string; hash?: string; label?: string }, minutes: number, reason: string, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const hash = target.ip ? await ipKey(target.ip) : (target.hash ?? "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Enter a valid IP address.");
  const label = target.ip ? maskIp(target.ip) : (target.label ?? "unknown");
  const mins = Math.min(Math.max(Math.round(minutes), 1), 365 * 24 * 60);
  const level = BAN_LEVELS.filter((l) => l.minutes <= mins).at(-1)?.level ?? 1;
  const ban = await upsertBan(db, { key: `ip:${hash}`, kind: "ip", label, reason: reason || "manual", level, minutes: mins, createdBy: actor.email });
  await logAdmin(db, actor, "shield.ban", "ip", hash.slice(0, 12), { label, minutes: mins, reason });
  return ban;
}

export async function unban(actor: AdminActor, key: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await db.delete(securityBans).where(eq(securityBans.key, key));
  await logAdmin(db, actor, "shield.unban", key.startsWith("account:") ? "account" : "ip", key.slice(0, 20));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Login lockouts (credentials provider)                               */
/* ------------------------------------------------------------------ */
export const LOCKOUT = { window: 15 * 60_000, lockAfter: 5, hardLockAfter: 10, ipBruteForceAfter: 20 };

export async function isLoginLocked(email: string, dbOverride?: DB, now = new Date()): Promise<boolean> {
  try {
    const db = dbOverride ?? (await getDb());
    const key = `account:${await accountKey(email)}`;
    const [row] = await db.select({ expiresAt: securityBans.expiresAt }).from(securityBans).where(eq(securityBans.key, key)).limit(1);
    return !!row && row.expiresAt > now;
  } catch {
    return false; // fail open: a DB blip must not lock everyone out
  }
}

/**
 * Records a failed password attempt. After 5 failures in 15 minutes the
 * account is locked for 15 minutes, after 10 for an hour; an address that
 * fails 20 times across any accounts is banned for an hour (stuffing).
 */
export async function recordLoginFailure(email: string, ip: string, dbOverride?: DB, now = new Date()): Promise<{ locked: boolean }> {
  try {
    const db = dbOverride ?? (await getDb());
    const subject = await accountKey(email);
    const ipHash = await ipKey(ip);
    const ipMasked = maskIp(ip);
    await recordEvent({ ipHash, ipMasked, method: "POST", path: "/api/auth/callback/credentials", verdict: "login-failed", rule: "login", mode: "monitor", subject }, db);
    const since = new Date(now.getTime() - LOCKOUT.window);
    const [acct] = await db.select({ n: count() }).from(securityEvents)
      .where(and(eq(securityEvents.subject, subject), eq(securityEvents.verdict, "login-failed"), gt(securityEvents.createdAt, since)));
    const failures = Number(acct?.n ?? 0);
    let locked = false;
    if (failures >= LOCKOUT.lockAfter) {
      const level = failures >= LOCKOUT.hardLockAfter ? 2 : 1;
      await upsertBan(db, { key: `account:${subject}`, kind: "account", label: maskEmail(email), reason: "too many failed sign-ins", level }, now);
      await recordEvent({ ipHash, ipMasked, method: "POST", path: "/api/auth/callback/credentials", verdict: "login-locked", rule: "login", mode: "monitor", subject, score: failures }, db);
      locked = true;
    }
    const [byIp] = await db.select({ n: count() }).from(securityEvents)
      .where(and(eq(securityEvents.ipHash, ipHash), eq(securityEvents.verdict, "login-failed"), gt(securityEvents.createdAt, since)));
    if (Number(byIp?.n ?? 0) >= LOCKOUT.ipBruteForceAfter) {
      await upsertBan(db, { key: `ip:${ipHash}`, kind: "ip", label: ipMasked, reason: "credential stuffing", level: 2 }, now);
    }
    return { locked };
  } catch {
    return { locked: false };
  }
}

/* ------------------------------------------------------------------ */
/* Housekeeping                                                         */
/* ------------------------------------------------------------------ */
export const EVENT_RETENTION_DAYS = 7;

export async function pruneShield(dbOverride?: DB, now = new Date()): Promise<void> {
  try {
    const db = dbOverride ?? (await getDb());
    await db.delete(securityEvents).where(lt(securityEvents.createdAt, new Date(now.getTime() - EVENT_RETENTION_DAYS * 24 * 60 * 60_000)));
    await db.delete(securityBans).where(lt(securityBans.expiresAt, new Date(now.getTime() - 24 * 60 * 60_000)));
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ */
/* Admin → Security overview                                            */
/* ------------------------------------------------------------------ */
export interface ShieldOverview {
  settings: ShieldSettings;
  stats: { blocked24h: number; monitored24h: number; suspicious24h: number; loginFailed24h: number; activeBans: number; events7d: number };
  topRules: { rule: string; n: number }[];
  topAddresses: { ipMasked: string; ipHash: string; country: string | null; n: number }[];
  events: {
    id: string; at: string; ipMasked: string; ipHash: string; country: string | null; method: string; path: string;
    userAgent: string | null; verdict: string; rule: string; score: number; mode: string; matches: Match[];
  }[];
  bans: { key: string; kind: string; label: string; reason: string; level: number; hits: number; expiresAt: string; createdBy: string; createdAt: string }[];
  catalogue: typeof RULE_CATALOGUE;
  ladder: { blocks: number; level: number; label: string }[];
}

export async function getShieldOverview(dbOverride?: DB, now = new Date()): Promise<ShieldOverview> {
  const db = dbOverride ?? (await getDb());
  const settings = await getShieldSettings(db, true);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

  const countWhere = async (...conds: ReturnType<typeof eq>[]) => {
    const [r] = await db.select({ n: count() }).from(securityEvents).where(and(gt(securityEvents.createdAt, dayAgo), ...conds));
    return Number(r?.n ?? 0);
  };
  const [blocked24h, monitored24h, suspicious24h, loginFailed24h] = await Promise.all([
    (async () => {
      const [r] = await db.select({ n: count() }).from(securityEvents)
        .where(and(gt(securityEvents.createdAt, dayAgo), inArray(securityEvents.verdict, ["blocked", "banned", "rate-limited"])));
      return Number(r?.n ?? 0);
    })(),
    countWhere(eq(securityEvents.verdict, "monitored")),
    countWhere(eq(securityEvents.verdict, "suspicious")),
    countWhere(eq(securityEvents.verdict, "login-failed")),
  ]);
  const [activeBansRow] = await db.select({ n: count() }).from(securityBans).where(gt(securityBans.expiresAt, now));
  const [events7dRow] = await db.select({ n: count() }).from(securityEvents);

  const topRules = (await db.select({ rule: securityEvents.rule, n: count() }).from(securityEvents)
    .where(gt(securityEvents.createdAt, dayAgo)).groupBy(securityEvents.rule).orderBy(desc(count())).limit(8))
    .map((r) => ({ rule: r.rule, n: Number(r.n) }));

  const topAddresses = (await db.select({
    ipHash: securityEvents.ipHash, ipMasked: sql<string>`max(${securityEvents.ipMasked})`, country: sql<string | null>`max(${securityEvents.country})`, n: count(),
  }).from(securityEvents).where(gt(securityEvents.createdAt, dayAgo)).groupBy(securityEvents.ipHash).orderBy(desc(count())).limit(8))
    .map((r) => ({ ipHash: r.ipHash, ipMasked: r.ipMasked, country: r.country ?? null, n: Number(r.n) }));

  const events = (await db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(200)).map((e) => ({
    id: e.id, at: e.createdAt.toISOString(), ipMasked: e.ipMasked, ipHash: e.ipHash, country: e.country, method: e.method, path: e.path,
    userAgent: e.userAgent, verdict: e.verdict, rule: e.rule, score: e.score, mode: e.mode,
    matches: Array.isArray(e.matches) ? (e.matches as Match[]) : [],
  }));

  const bans = (await db.select().from(securityBans).where(gt(securityBans.expiresAt, now)).orderBy(desc(securityBans.updatedAt)).limit(200)).map((b) => ({
    key: b.key, kind: b.kind, label: b.label, reason: b.reason, level: b.level, hits: b.hits,
    expiresAt: b.expiresAt.toISOString(), createdBy: b.createdBy, createdAt: b.createdAt.toISOString(),
  }));

  return {
    settings,
    stats: { blocked24h, monitored24h, suspicious24h, loginFailed24h, activeBans: Number(activeBansRow?.n ?? 0), events7d: Number(events7dRow?.n ?? 0) },
    topRules,
    topAddresses,
    events,
    bans,
    catalogue: RULE_CATALOGUE,
    ladder: ESCALATION.map((e) => ({ ...e, label: BAN_LEVELS[e.level - 1]!.label })).reverse(),
  };
}
