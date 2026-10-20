import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.CLYVRO_DB_MEMORY = "1";

type DB = import("@/lib/db").DB;
let db: DB;
let schema: typeof import("@/lib/db/schema");
let accounts: typeof import("@/lib/services/accounts");
let readiness: typeof import("@/lib/services/readiness");

beforeAll(async () => {
  db = await (await import("@/lib/db")).createDb();
  schema = await import("@/lib/db/schema");
  accounts = await import("@/lib/services/accounts");
  readiness = await import("@/lib/services/readiness");
}, 60_000);

describe("detectTech fingerprints", () => {
  it("finds framework + analytics markers with evidence", async () => {
    const html = `<html><head><script src="/_next/static/chunks/main.js"></script>
      <script>window.__NEXT_DATA__={}</script>
      <script src="https://www.googletagmanager.com/gtm.js"></script></head>
      <body><img src="/wp-content/uploads/x.jpg"></body></html>`;
    const names = readiness.detectTech(html, { "cf-ray": "abc-LOS", "x-powered-by": "Next.js" }).map((t) => t.name);
    expect(names).toContain("Next.js (React)");
    expect(names).toContain("Google Tag Manager");
    expect(names).toContain("WordPress");
    expect(names.some((n) => n.includes("Cloudflare"))).toBe(true);
  });
  it("returns nothing for a bare page (no invented stack)", () => {
    expect(readiness.detectTech("<html><body>Hello</body></html>", {})).toEqual([]);
  });
});

describe("readiness tiers + 24h trial", () => {
  // Fake transport: every request gets ordinary HTML so the engine runs
  // offline. DNS/RDAP/TLS fail soft by design in this environment.
  const transport = async () => ({
    status: 200,
    header: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null),
    body: (async function* () {
      yield new TextEncoder().encode(`<html><head><link rel="icon" href="/f.ico"></head><body>ok</body></html>`);
    })(),
    cancelBody: async () => undefined,
  });

  it("free plan gets a basic trial check, then the trial clock is enforced", async () => {
    const acc = await accounts.registerAccount({ name: "R", email: "ready@example.com", password: "a-long-password-123" }, db);
    const accessBefore = await readiness.readinessAccess(acc.organizationId, db);
    expect(accessBefore.trial.used).toBe(false);

    const { report } = await readiness.runAndSaveReadiness(
      acc.organizationId, acc.userId, "github.com", { transport: transport as never }, db);
    expect(report.tier).toBe("basic");
    expect(report.checks.length).toBeGreaterThan(8);
    expect(report.checks.find((c) => c.id === "reachable")?.status).toBe("pass");

    // Backdate the first check beyond 24h → trial over.
    await db.update(schema.readinessChecks)
      .set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(schema.readinessChecks.organizationId, acc.organizationId));
    await expect(readiness.runAndSaveReadiness(
      acc.organizationId, acc.userId, "github.com", { transport: transport as never }, db))
      .rejects.toMatchObject({ code: "PLAN_LIMIT" });
  }, 60_000);

  it("Ultra runs the full check set (email-auth group included when MX exists)", async () => {
    const acc = await accounts.registerAccount({ name: "U", email: "ultra-ready@example.com", password: "a-long-password-123" }, db);
    await db.update(schema.organizations).set({ planId: "ultra-agency" }).where(eq(schema.organizations.id, acc.organizationId));
    const { report } = await readiness.runAndSaveReadiness(
      acc.organizationId, acc.userId, "github.com", { transport: transport as never }, db);
    expect(report.tier).toBe("full");
    expect(report.checks.some((c) => c.id === "csp")).toBe(true);
    expect(report.checks.some((c) => c.id === "ipv6")).toBe(true);
  }, 60_000);
});
