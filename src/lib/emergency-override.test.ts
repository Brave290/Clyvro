import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  isHeavyFlood, HEAVY_FLOOD, ATTACK_MAINTENANCE_MESSAGE, EMERGENCY_OVERRIDE_KEY,
  SHIELD_AUTO_ACTOR, maybeActivateEmergencyOverride,
} from "@/lib/services/emergency-override";

describe("isHeavyFlood", () => {
  it("stays quiet on a single noisy address", () => {
    expect(isHeavyFlood({ distinctIps: 1, hostileEvents: 80 })).toBe(false);
  });

  it("trips on a distributed flood", () => {
    expect(isHeavyFlood({ distinctIps: HEAVY_FLOOD.minDistinctIps, hostileEvents: HEAVY_FLOOD.minHostileEvents })).toBe(true);
  });

  it("trips on a concentrated exploit wave", () => {
    expect(isHeavyFlood({ distinctIps: HEAVY_FLOOD.concentratedIps, hostileEvents: HEAVY_FLOOD.concentratedEvents })).toBe(true);
  });

  it("needs both spread and volume", () => {
    expect(isHeavyFlood({ distinctIps: 8, hostileEvents: 8 })).toBe(false);
    expect(isHeavyFlood({ distinctIps: 2, hostileEvents: 60 })).toBe(false);
  });
});

describe("maybeActivateEmergencyOverride (PGlite)", () => {
  type DB = import("@/lib/db").DB;
  let db: DB;
  let shield: typeof import("@/lib/services/shield");
  let site: typeof import("@/lib/services/site");
  let schema: typeof import("@/lib/db/schema");
  const actor = SHIELD_AUTO_ACTOR;
  let nonce = 0;

  beforeAll(async () => {
    db = await (await import("@/lib/db")).createDb();
    shield = await import("@/lib/services/shield");
    site = await import("@/lib/services/site");
    schema = await import("@/lib/db/schema");
  }, 60_000);

  beforeEach(async () => {
    await shield.setShieldMode(actor, "monitor", db);
    await site.setMaintenance(actor, { enabled: false, message: site.DEFAULT_MAINTENANCE.message, eta: null, reason: "manual" }, db);
    await db.delete(schema.siteSettings).where(eq(schema.siteSettings.key, EMERGENCY_OVERRIDE_KEY));
  });

  async function seed(ips: number, perIp: number) {
    nonce += 1;
    const tag = `t${nonce}`;
    for (let i = 0; i < ips; i += 1) {
      const ipHash = `flood-${tag}-${i.toString().padStart(2, "0")}-${"a".repeat(24)}`;
      for (let n = 0; n < perIp; n += 1) {
        await shield.recordEvent({
          ipHash, ipMasked: `198.51.100.${i}`, method: "GET", path: "/pricing",
          verdict: "rate-limited", rule: "rate-limit", mode: "monitor",
        }, db);
      }
    }
  }

  it("switches to emergency override and attack maintenance on a real flood", async () => {
    await seed(HEAVY_FLOOD.minDistinctIps, Math.ceil(HEAVY_FLOOD.minHostileEvents / HEAVY_FLOOD.minDistinctIps));
    const result = await maybeActivateEmergencyOverride(db);
    expect(result.activated).toBe(true);
    expect((await shield.getShieldSettings(db, true)).mode).toBe("under-attack");
    const maintenance = await site.getMaintenance(db, true);
    expect(maintenance.enabled).toBe(true);
    expect(maintenance.reason).toBe("attack");
    expect(maintenance.message).toBe(ATTACK_MAINTENANCE_MESSAGE);
  });

  it("does not re-fire inside the cooldown", async () => {
    await seed(HEAVY_FLOOD.minDistinctIps, Math.ceil(HEAVY_FLOOD.minHostileEvents / HEAVY_FLOOD.minDistinctIps));
    expect((await maybeActivateEmergencyOverride(db)).activated).toBe(true);
    const again = await maybeActivateEmergencyOverride(db);
    expect(again.activated).toBe(false);
    if (!again.activated) expect(["cooldown", "already-active"]).toContain(again.reason);
  });
});
