import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { inspectRequest, decide, csrfExempt, shieldExempt } from "@/lib/shield/rules";

process.env.CLYVRO_DB_MEMORY = "1";

type DB = import("@/lib/db").DB;
let db: DB;
let registerAccount: typeof import("@/lib/services/accounts").registerAccount;
let orgApi: typeof import("@/lib/services/org-api");
let organizations: typeof import("@/lib/db/schema").organizations;

beforeAll(async () => {
  db = await (await import("@/lib/db")).createDb();
  registerAccount = (await import("@/lib/services/accounts")).registerAccount;
  orgApi = await import("@/lib/services/org-api");
  organizations = (await import("@/lib/db/schema")).organizations;
}, 60_000);

describe("Site API keys", () => {
  it("refuses Free workspaces and issues a hashed Pro key", async () => {
    const free = await registerAccount(
      { name: "Free API", email: "api-free@example.com", password: "a-long-password-123" },
      db,
    );
    await expect(orgApi.createOrgApiKey(free.organizationId, free.userId, "dev", db))
      .rejects.toMatchObject({ code: "PLAN_LIMIT" });

    const pro = await registerAccount(
      { name: "Pro API", email: "api-pro@example.com", password: "a-long-password-123" },
      db,
    );
    await db.update(organizations).set({ planId: "pro" }).where(eq(organizations.id, pro.organizationId));
    const created = await orgApi.createOrgApiKey(pro.organizationId, pro.userId, "Production", db);
    expect(created.secret.startsWith("cly_")).toBe(true);
    expect(created.prefix).toBe(created.secret.slice(0, 12));

    const ctx = await orgApi.authenticateApiKey(`Bearer ${created.secret}`, db);
    expect(ctx.organizationId).toBe(pro.organizationId);
    expect(ctx.userId).toBe(pro.userId);

    await expect(orgApi.authenticateApiKey("Bearer cly_deadbeefdeadbeefdeadbeef", db))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await orgApi.revokeOrgApiKey(pro.organizationId, created.id, db);
    await expect(orgApi.authenticateApiKey(`Bearer ${created.secret}`, db))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("Site Guard inspector (same rules as Shield)", () => {
  it("blocks honeypots and tool UAs, allows a normal homepage", () => {
    const home = inspectRequest({ method: "GET", pathname: "/", search: "", userAgent: "Mozilla/5.0" });
    expect(decide(home, "enforce")).toBe("allow");
    const env = inspectRequest({ method: "GET", pathname: "/.env", search: "", userAgent: "Mozilla/5.0" });
    expect(decide(env, "enforce")).toBe("block");
    const tool = inspectRequest({ method: "GET", pathname: "/", search: "", userAgent: "sqlmap/1.7" });
    expect(decide(tool, "enforce")).toBe("block");
  });

  it("does not CSRF-block or Shield-ban /api/v1 from another origin", () => {
    expect(csrfExempt("/api/v1/guard")).toBe(true);
    expect(csrfExempt("/api/v1/scans")).toBe(true);
    expect(shieldExempt("/api/v1/guard")).toBe(true);
  });
});
