/**
 * Site-wide heavy-flood detector.
 *
 * Per-IP bans already exist (escalate / flood ladder). This path watches
 * the *shape* of recent hostile events across many addresses. When a real
 * distributed flood is happening, Shield switches itself to Emergency
 * override (the last mode after Monitor and Enforce — stored as
 * `under-attack`) and the public site goes into maintenance with a
 * breach-attack notice. Admin, /emergency, APIs and sign-in stay up.
 *
 * Never throws — a detector bug must not take requests down.
 */
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { securityEvents, siteSettings } from "@/lib/db/schema";
import { getShieldSettings, setShieldMode } from "@/lib/services/shield";
import { getMaintenance, setMaintenance } from "@/lib/services/site";
import { enqueueIncidentEmail } from "@/lib/services/notifications";
import type { AdminActor } from "@/lib/services/admin";

export const SHIELD_AUTO_ACTOR: AdminActor = { userId: "shield-auto", email: "shield@clyvro" };

export const ATTACK_MAINTENANCE_MESSAGE =
  "We are under a breach attack. A heavy flood was detected against Clyvro. Emergency override is on and the public site is offline so we can contain it. Your data is safe. Admin and emergency access still work.";

export const HEAVY_FLOOD = {
  /** Look-back window for the live count. */
  windowMs: 2 * 60 * 1000,
  /** Distributed flood: many distinct addresses hitting Shield. */
  minDistinctIps: 8,
  minHostileEvents: 24,
  /** Concentrated exploit wave: fewer hosts, lots of blocks. */
  concentratedIps: 3,
  concentratedEvents: 60,
  /** Do not re-fire (or fight an admin who just turned it off) inside this window. */
  cooldownMs: 15 * 60 * 1000,
} as const;

export const EMERGENCY_OVERRIDE_KEY = "shield.emergency-override";

export interface FloodStats {
  distinctIps: number;
  hostileEvents: number;
}

export function isHeavyFlood(stats: FloodStats): boolean {
  if (stats.distinctIps >= HEAVY_FLOOD.minDistinctIps && stats.hostileEvents >= HEAVY_FLOOD.minHostileEvents) return true;
  if (stats.distinctIps >= HEAVY_FLOOD.concentratedIps && stats.hostileEvents >= HEAVY_FLOOD.concentratedEvents) return true;
  return false;
}

export type EmergencyOverrideResult =
  | { activated: true; stats: FloodStats }
  | { activated: false; reason: "below-threshold" | "cooldown" | "already-active" | "error"; stats?: FloodStats };

interface OverrideState {
  activatedAt: string;
  distinctIps: number;
  hostileEvents: number;
}

function parseOverrideState(raw: unknown): OverrideState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<OverrideState>;
  if (typeof r.activatedAt !== "string") return null;
  return {
    activatedAt: r.activatedAt,
    distinctIps: typeof r.distinctIps === "number" ? r.distinctIps : 0,
    hostileEvents: typeof r.hostileEvents === "number" ? r.hostileEvents : 0,
  };
}

async function countHostile(db: DB, since: Date): Promise<FloodStats> {
  const rows = await db
    .select({ ipHash: securityEvents.ipHash, n: count() })
    .from(securityEvents)
    .where(and(
      gt(securityEvents.createdAt, since),
      inArray(securityEvents.verdict, ["blocked", "rate-limited", "banned"]),
    ))
    .groupBy(securityEvents.ipHash);
  let hostileEvents = 0;
  for (const r of rows) hostileEvents += Number(r.n ?? 0);
  return { distinctIps: rows.length, hostileEvents };
}

let lastCheckAt = 0;

/**
 * Inspect recent Shield events and, if a heavy flood is in progress,
 * switch to Emergency override and enable attack maintenance.
 * Pass a db override to skip the in-memory check throttle (tests).
 */
export async function maybeActivateEmergencyOverride(dbOverride?: DB, now = new Date()): Promise<EmergencyOverrideResult> {
  if (!dbOverride) {
    const t = now.getTime();
    if (t - lastCheckAt < 8_000) return { activated: false, reason: "cooldown" };
    lastCheckAt = t;
  }
  try {
    const db = dbOverride ?? (await getDb());
    const stats = await countHostile(db, new Date(now.getTime() - HEAVY_FLOOD.windowMs));
    if (!isHeavyFlood(stats)) return { activated: false, reason: "below-threshold", stats };

    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, EMERGENCY_OVERRIDE_KEY)).limit(1);
    const prev = parseOverrideState(row?.value);
    if (prev && now.getTime() - new Date(prev.activatedAt).getTime() < HEAVY_FLOOD.cooldownMs) {
      return { activated: false, reason: "cooldown", stats };
    }

    const mode = (await getShieldSettings(db, true)).mode;
    const maintenance = await getMaintenance(db, true);
    if (mode === "under-attack" && maintenance.enabled && maintenance.reason === "attack") {
      return { activated: false, reason: "already-active", stats };
    }

    if (mode !== "under-attack") {
      await setShieldMode(SHIELD_AUTO_ACTOR, "under-attack", db);
    }
    await setMaintenance(SHIELD_AUTO_ACTOR, {
      enabled: true,
      message: ATTACK_MAINTENANCE_MESSAGE,
      eta: null,
      reason: "attack",
    }, db);

    const state: OverrideState = { activatedAt: now.toISOString(), distinctIps: stats.distinctIps, hostileEvents: stats.hostileEvents };
    await db.insert(siteSettings)
      .values({ key: EMERGENCY_OVERRIDE_KEY, value: state, updatedBy: SHIELD_AUTO_ACTOR.email, updatedAt: now })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: state, updatedBy: SHIELD_AUTO_ACTOR.email, updatedAt: now } });

    try {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "");
      const ownerEmail = process.env.WAITLIST_NOTIFY_EMAIL ?? process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? "admin.founda@gmail.com";
      await enqueueIncidentEmail({
        toEmail: ownerEmail,
        attackType: "heavy flood (emergency override)",
        severity: "critical",
        dedupeKey: `shield:flood:${Math.floor(now.getTime() / HEAVY_FLOOD.cooldownMs)}`,
        time: now.toISOString(),
        evidence: `${stats.distinctIps} addresses, ${stats.hostileEvents} hostile events in ${HEAVY_FLOOD.windowMs / 1000}s`,
        confidence: 95,
        isConfirmed: true,
        actionsTaken: [
          "Switched Shield to Emergency override (under-attack)",
          "Enabled public maintenance with a breach-attack notice",
        ],
        nextSteps: [
          "Admin, /emergency and sign-in stay reachable",
          "Turn maintenance off from Admin → Maintenance when the flood has passed",
          "Switch Shield back to Enforce or Monitor from Admin → Security",
        ],
        eventIds: ["heavy-flood"],
        dashboardUrl: `${siteUrl}/admin/security`,
        status: "blocked",
      }, db);
    } catch { /* email is best-effort */ }

    return { activated: true, stats };
  } catch {
    return { activated: false, reason: "error" };
  }
}
