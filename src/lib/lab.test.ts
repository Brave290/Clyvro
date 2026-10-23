process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { navItemBeta, navItemLocked, PRO_NAV_HREFS } from "@/lib/workspace-nav";
import { labAccess, labCatalog, runLabProbe } from "@/lib/services/lab";

const fakeResolver = async () => [{ address: "93.184.216.34", family: 4 }];
function fakeTransport(status: number, body: string, contentType = "text/plain") {
  return async (_target: { url: URL }) => ({
    status,
    header: (n: string) => (n.toLowerCase() === "content-type" ? contentType : null),
    allHeaders: () => ({ "content-type": contentType }),
    body: (async function* () { yield new TextEncoder().encode(body); })(),
    cancelBody: async () => undefined,
  });
}

describe("workspace nav locks", () => {
  it("locks Pro tools on Free/Starter and leaves Scan clickable", () => {
    for (const href of PRO_NAV_HREFS) {
      expect(navItemLocked(href, "freemium")).toBe(true);
      expect(navItemLocked(href, "basic")).toBe(true);
      expect(navItemLocked(href, "pro")).toBe(false);
      expect(navItemLocked(href, "ultra-agency")).toBe(false);
    }
    expect(navItemLocked("/app/scan", "freemium")).toBe(false);
    expect(navItemLocked("/app/lab", "freemium")).toBe(true);
    expect(navItemBeta("/app/scan")).toBe(true);
    expect(navItemBeta("/app/pentest")).toBe(true);
    expect(navItemBeta("/app/lab")).toBe(true);
    expect(navItemBeta("/app/flow-scan")).toBe(false);
  });
});

describe("Lab", () => {
  it("is Pro/Agency only and refuses junk paths", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const schema = await import("@/lib/db/schema");
    const free = await accounts.registerAccount(
      { name: "Free", email: "lab-free@example.com", password: "a-long-password-123" }, db);
    expect((await labAccess(free.organizationId, db)).allowed).toBe(false);

    const pro = await accounts.registerAccount(
      { name: "Pro", email: "lab-pro@example.com", password: "a-long-password-123" }, db);
    await db.update(schema.organizations).set({ planId: "pro", planExpiresAt: null })
      .where(eq(schema.organizations.id, pro.organizationId));
    expect((await labAccess(pro.organizationId, db)).allowed).toBe(true);
    expect(labCatalog(".env")[0]).toMatch(/\.env/);

    await expect(runLabProbe(pro.organizationId, pro.userId, {
      url: "https://github.com", path: "http://evil", ownsOrAuthorized: true, acceptLogs: true, noThirdPartyAttack: true,
    }, { db, resolver: fakeResolver as never })).rejects.toMatchObject({ code: "VALIDATION" });
  }, 30_000);

  it("sends GET on a verified domain and returns the live status", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const schema = await import("@/lib/db/schema");
    const { newId } = await import("@/lib/db");
    const pro = await accounts.registerAccount(
      { name: "Pro2", email: "lab-pro2@example.com", password: "a-long-password-123" }, db);
    await db.update(schema.organizations).set({ planId: "pro", planExpiresAt: null })
      .where(eq(schema.organizations.id, pro.organizationId));
    await db.insert(schema.domainVerifications).values({
      id: newId(), organizationId: pro.organizationId, createdBy: pro.userId,
      domain: "github.com", tokenHash: "t", recordName: "_clyvro-verify.github.com",
      status: "verified", attempts: 1, expiresAt: new Date(Date.now() + 86400_000), verifiedAt: new Date(),
    });
    const result = await runLabProbe(pro.organizationId, pro.userId, {
      url: "https://github.com", path: "/.env", method: "GET",
      ownsOrAuthorized: true, acceptLogs: true, noThirdPartyAttack: true,
    }, { db, resolver: fakeResolver as never, transport: fakeTransport(404, "not found") as never });
    expect(result.status).toBe(404);
    expect(result.path).toBe("/.env");
    expect(result.body).toContain("not found");
  }, 30_000);

  it("site scan discovers linked pages and keeps the sensitive baseline", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const schema = await import("@/lib/db/schema");
    const { newId } = await import("@/lib/db");
    const { runLabSiteScan } = await import("@/lib/services/lab");
    const { SENSITIVE_BASELINE_PATHS } = await import("@/lib/pentest/catalog");
    expect(SENSITIVE_BASELINE_PATHS.length).toBeGreaterThan(40);
    expect(SENSITIVE_BASELINE_PATHS).toContain("/.env");
    expect(SENSITIVE_BASELINE_PATHS).toContain("/backup/.env");

    const pro = await accounts.registerAccount(
      { name: "Pro3", email: "lab-pro3@example.com", password: "a-long-password-123" }, db);
    await db.update(schema.organizations).set({ planId: "pro", planExpiresAt: null })
      .where(eq(schema.organizations.id, pro.organizationId));
    await db.insert(schema.domainVerifications).values({
      id: newId(), organizationId: pro.organizationId, createdBy: pro.userId,
      domain: "github.com", tokenHash: "t", recordName: "_clyvro-verify.github.com",
      status: "verified", attempts: 1, expiresAt: new Date(Date.now() + 86400_000), verifiedAt: new Date(),
    });

    const transport = async (target: { url: URL }) => {
      const path = target.url.pathname;
      const html = path === "/" || path === ""
        ? "<html><a href=\"/pricing\">Pricing</a></html>"
        : path === "/pricing" ? "<html>Plans</html>" : "nope";
      const status = path === "/.env" || path.startsWith("/backup") ? 404 : 200;
      return {
        status,
        header: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null),
        allHeaders: () => ({ "content-type": "text/html" }),
        body: (async function* () { yield new TextEncoder().encode(html); })(),
        cancelBody: async () => undefined,
      };
    };

    const report = await runLabSiteScan(pro.organizationId, pro.userId, {
      url: "https://github.com", ownsOrAuthorized: true, acceptLogs: true, noThirdPartyAttack: true,
    }, { db, resolver: fakeResolver as never, transport: transport as never });
    expect(report.pagesDiscovered).toBeGreaterThan(1);
    expect(report.rows.some((r) => r.url.endsWith("/pricing") && r.mark === "FOUND")).toBe(true);
    expect(report.rows.some((r) => r.sensitive && r.url.includes("/.env"))).toBe(true);
    expect(report.rows[0]?.mark === "EXPOSED" || report.sensitiveHits === 0).toBe(true);
  }, 30_000);
});
