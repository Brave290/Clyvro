process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";

describe("tool access gates (taste free, Ultra unlimited)", () => {
  it("Freemium gets 2 lifetime Hack runs then PLAN_LIMIT; Ultra never blocked; dev pool differs per tool on free", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const accounts = await import("@/lib/services/accounts");
    const access = await import("@/lib/services/tool-access");

    const free = await accounts.registerAccount(
      { name: "F", email: "free-tools@example.com", password: "a-long-password-123" }, db);
    await access.consumeToolRun(free.organizationId, "hack-protection", db);
    await access.consumeToolRun(free.organizationId, "hack-protection", db);
    const third = await access.toolAccess(free.organizationId, "hack-protection", db);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    await expect(access.consumeToolRun(free.organizationId, "hack-protection", db))
      .rejects.toThrow(/free .* runs|PLAN_LIMIT|Ultra Agency/);

    // SEO has its own counter — untouched by Hack usage.
    expect((await access.toolAccess(free.organizationId, "seo-visibility", db)).remaining).toBe(2);
    // Dev tools on Freemium are per-tool: ssl 3, dns still 3.
    await access.consumeToolRun(free.organizationId, "ssl", db);
    expect((await access.toolAccess(free.organizationId, "ssl", db)).remaining).toBe(2);
    expect((await access.toolAccess(free.organizationId, "dns", db)).remaining).toBe(3);

    // Ultra (admin override stands in for the purchased tier): unlimited.
    await db.update(schema.organizations)
      .set({ adminPlanId: "ultra-agency" })
      .where(eq(schema.organizations.id, free.organizationId));
    const ultra = await access.toolAccess(free.organizationId, "hack-protection", db);
    expect(ultra.limit).toBeNull();
    expect(ultra.allowed).toBe(true);
    for (let i = 0; i < 5; i++) await access.consumeToolRun(free.organizationId, "hack-protection", db);
    expect((await access.toolAccess(free.organizationId, "hack-protection", db)).allowed).toBe(true);
  });
});
