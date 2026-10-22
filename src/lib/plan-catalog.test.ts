import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.CLYVRO_DB_MEMORY = "1";

type DB = import("@/lib/db").DB;
let db: DB;
let catalog: typeof import("@/lib/services/plan-catalog");
let billing: typeof import("@/lib/billing");
let plans: typeof import("@/lib/plans");
let schema: typeof import("@/lib/db/schema");

beforeAll(async () => {
  const dbMod = await import("@/lib/db");
  db = await dbMod.createDb();
  catalog = await import("@/lib/services/plan-catalog");
  billing = await import("@/lib/billing");
  plans = await import("@/lib/plans");
  schema = await import("@/lib/db/schema");
}, 60_000);

afterEach(() => {
  plans.setPlanOverlay(null);
  billing.setPriceOverlay(null);
});

describe("admin billing catalog", () => {
  it("saved prices and names overlay the defaults and show on live plans", async () => {
    const actor = { userId: "admin", email: "admin@example.com" };
    const next = catalog.defaultCatalog();
    next.pro = { ...next.pro, name: "Pro Plus", tagline: "Edited from admin", prices: { ...(next.pro?.prices ?? {}), NGN: 88000, USD: 55 } };
    await catalog.savePlanCatalog(actor, next, db);
    expect(plans.getPlan("pro").name).toBe("Pro Plus");
    expect(plans.getPlan("pro").tagline).toBe("Edited from admin");
    expect(billing.priceFor("pro", "NGN")).toEqual({ amount: 88000, currency: "NGN" });
    expect(billing.priceFor("pro", "USD")).toEqual({ amount: 55, currency: "USD" });

    plans.setPlanOverlay(null);
    billing.setPriceOverlay(null);
    await catalog.hydratePlanCatalog(db);
    expect(plans.getPlan("pro").name).toBe("Pro Plus");
    expect(billing.priceFor("pro", "NGN")?.amount).toBe(88000);

    const [row] = await db.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, catalog.CATALOG_KEY));
    expect(row?.updatedBy).toBe("admin@example.com");
  }, 30_000);

  it("refuses a paid plan with no USD price", async () => {
    const actor = { userId: "admin", email: "admin@example.com" };
    const next = catalog.defaultCatalog();
    next.basic = { ...next.basic, prices: { USD: 0, NGN: 1 } };
    await expect(catalog.savePlanCatalog(actor, next, db)).rejects.toMatchObject({ code: "VALIDATION" });
  }, 30_000);
});
