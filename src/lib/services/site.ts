import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { logAdmin, type AdminActor } from "@/lib/services/admin";
export { maintenanceAllows } from "@/lib/services/site-shared";

/**
 * Platform site settings (key-value). Currently powers maintenance
 * mode: when enabled, public pages redirect to /maintenance while
 * /admin, /api, auth and the maintenance page itself stay reachable so
 * the team can work and monitor.
 */

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  /** Optional ISO timestamp shown as the expected return time. */
  eta: string | null;
  /** `attack` = Shield auto-enabled this during a heavy flood. */
  reason: "manual" | "attack";
}

export const DEFAULT_MAINTENANCE: MaintenanceState = {
  enabled: false,
  message: "We're making Clyvro better. Scans and accounts are paused for a short while — your data is safe and nothing is lost.",
  eta: null,
  reason: "manual",
};

let maintenanceCache: { value: MaintenanceState; at: number } | null = null;
const MAINTENANCE_CACHE_MS = 20_000;

export async function getMaintenance(dbOverride?: DB, fresh = false): Promise<MaintenanceState> {
  if (!fresh && maintenanceCache && Date.now() - maintenanceCache.at < MAINTENANCE_CACHE_MS) {
    return maintenanceCache.value;
  }
  try {
    const db = dbOverride ?? (await getDb());
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, "maintenance")).limit(1);
    const raw = (row?.value ?? {}) as Partial<MaintenanceState>;
    const value: MaintenanceState = {
      enabled: raw.enabled === true,
      message: typeof raw.message === "string" && raw.message.trim() ? raw.message.slice(0, 500) : DEFAULT_MAINTENANCE.message,
      eta: typeof raw.eta === "string" && raw.eta ? raw.eta : null,
      reason: raw.reason === "attack" ? "attack" : "manual",
    };
    maintenanceCache = { value, at: Date.now() };
    return value;
  } catch {
    // Fail open: a settings hiccup must never take the site down.
    return DEFAULT_MAINTENANCE;
  }
}

export async function setMaintenance(actor: AdminActor, state: MaintenanceState, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const value: MaintenanceState = {
    enabled: state.enabled === true,
    message: (state.message || DEFAULT_MAINTENANCE.message).slice(0, 500),
    eta: state.eta || null,
    reason: state.reason === "attack" ? "attack" : "manual",
  };
  await db.insert(siteSettings)
    .values({ key: "maintenance", value, updatedBy: actor.email, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.email, updatedAt: new Date() } });
  maintenanceCache = { value, at: Date.now() };
  await logAdmin(db, actor, value.enabled ? "maintenance.enable" : "maintenance.disable", "site", "maintenance");
  return { ok: true, maintenance: value };
}


