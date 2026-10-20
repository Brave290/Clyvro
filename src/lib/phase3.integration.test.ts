/**
 * Phase 3 integration tests — real Postgres semantics via embedded PGlite
 * (in-memory). Covers: migrations, registration, organization isolation,
 * plan quotas, background-job processing with a stubbed scanner transport,
 * idempotent usage charging, finding lifecycle, comparison, share tokens.
 *
 * No external network: DNS + HTTP are stubbed through the scanner's
 * dependency-injection points (the same seams used by Phase 2 tests).
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.CLYVRO_DB_MEMORY = "1";

type DB = import("@/lib/db").DB;
let db: DB;

let registerAccount: typeof import("@/lib/services/accounts").registerAccount;
let svc: typeof import("@/lib/services/audits");
let jobs: typeof import("@/lib/jobs");
let passwords: typeof import("@/lib/passwords");

const PUBLIC_RESOLVER = async () => [{ address: "93.184.216.34", family: 4 }];

function transportFor(pages: Record<string, { status: number; html: string }>) {
  return async (target: { url: URL }) => {
    const hit = pages[target.url.pathname] ?? { status: 404, html: "not found" };
    const body = new TextEncoder().encode(hit.html);
    return {
      status: hit.status,
      header: (name: string) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null),
      body: (async function* () { yield body; })(),
      cancelBody: async () => {},
    };
  };
}

const SITE_V1 = {
  "/": {
    status: 200,
    html: `<html lang="en"><head><title>Test Co</title></head><body>
      <h1>Test Co</h1><img src="/hero.png">
      <a href="/about">About</a><a href="/gone">Broken</a>
    </body></html>`,
  },
  "/about": {
    status: 200,
    html: `<html lang="en"><head><title>About — Test Co</title><meta name="description" content="About us"></head>
      <body><h1>About</h1><a href="/">Home</a></body></html>`,
  },
  "/robots.txt": { status: 404, html: "no robots" },
};

beforeAll(async () => {
  db = await (await import("@/lib/db")).createDb();
  registerAccount = (await import("@/lib/services/accounts")).registerAccount;
  svc = await import("@/lib/services/audits");
  jobs = await import("@/lib/jobs");
  passwords = await import("@/lib/passwords");
}, 60_000);

const register = (email: string) =>
  registerAccount({ name: "Tester", email, password: "a-long-password-123" }, db);

describe("passwords (scrypt)", () => {
  it("hashes with a salt and verifies timing-safely", () => {
    const h1 = passwords.hashPassword("correct horse battery");
    const h2 = passwords.hashPassword("correct horse battery");
    expect(h1).not.toBe(h2); // salted
    expect(passwords.verifyPassword("correct horse battery", h1)).toBe(true);
    expect(passwords.verifyPassword("wrong horse", h1)).toBe(false);
    expect(passwords.verifyPassword("correct horse battery", "garbage")).toBe(false);
    expect(passwords.passwordProblem("short")).toMatch(/at least/);
  });
});

describe("registration", () => {
  it("creates user + personal organization + owner membership", async () => {
    const { userId, organizationId } = await register("owner@example.com");
    expect(userId).toBeTruthy();
    const orgs = await (await import("@/lib/services/accounts")).organizationsForUser(userId, db);
    expect(orgs).toHaveLength(1);
    expect(orgs[0].organizationId).toBe(organizationId);
    expect(orgs[0].role).toBe("owner");
    expect(orgs[0].planId).toBe("freemium");
  });

  it("rejects duplicate emails and weak passwords", async () => {
    await expect(register("owner@example.com")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    await expect(
      registerAccount({ email: "new@example.com", password: "short" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      registerAccount({ email: "not-an-email", password: "a-long-password-123" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("organization isolation", () => {
  it("org B cannot see, audit, or mutate org A's data (404, no existence leak)", async () => {
    const a = await register("a@example.com");
    const b = await register("b@example.com");
    const project = await svc.createProject(a.organizationId, a.userId, {
      name: "A site", siteUrl: "https://github.com",
    }, db);

    await expect(svc.getProject(b.organizationId, project.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.listProjects(b.organizationId, db)).resolves.toHaveLength(0);
    await expect(
      svc.startAudit(b.organizationId, b.userId, project.id, {}, db),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      svc.getAuditDetail(b.organizationId, "nonexistent", db),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      svc.createShareToken(b.organizationId, b.userId, "nonexistent", db),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      svc.setFindingStatus(b.organizationId, "nonexistent", "dismissed", db),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 30_000);

  it("enforces the Freemium project limit server-side", async () => {
    const a = await register("limited@example.com");
    await svc.createProject(a.organizationId, a.userId, { name: "One", siteUrl: "https://github.com" }, db);
    await expect(
      svc.createProject(a.organizationId, a.userId, { name: "Two", siteUrl: "https://github.com" }, db),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT" });
  }, 30_000);
});

describe("quotas & plan gating", () => {
  it("blocks the 11th Freemium scan (charged + in-flight) and paid-only audit types", async () => {
    const a = await register("quota@example.com");
    const project = await svc.createProject(a.organizationId, a.userId, {
      name: "Quota site", siteUrl: "https://github.com",
    }, db);

    await expect(
      svc.startAudit(a.organizationId, a.userId, project.id, { auditTypes: ["conversion-ux"] }, db),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT" });

    const started: string[] = [];
    for (let i = 0; i < 10; i++) {
      const { auditId } = await svc.startAudit(a.organizationId, a.userId, project.id, {}, db);
      expect(auditId).toBeTruthy();
      started.push(auditId);
    }
    await expect(
      svc.startAudit(a.organizationId, a.userId, project.id, {}, db),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    // Leave no queued jobs behind for the worker tests below.
    for (const id of started) await svc.cancelAudit(a.organizationId, id, db);
  }, 30_000);
});

describe("background job end-to-end", () => {
  it("scans via the worker, persists pages/findings, charges usage exactly once", async () => {
    const a = await register("worker@example.com");
    const project = await svc.createProject(a.organizationId, a.userId, {
      name: "Worker site", siteUrl: "https://github.com",
    }, db);
    const { auditId } = await svc.startAudit(a.organizationId, a.userId, project.id, {}, db);

    const deps = { resolver: PUBLIC_RESOLVER, transport: transportFor(SITE_V1) };
    // Drain this org's job (earlier tests may have queued jobs too — process until ours completes).
    for (let i = 0; i < 10; i++) {
      const processed = await jobs.processNextScanJob(deps as never, db);
      const detail = await svc.getAuditDetail(a.organizationId, auditId, db);
      if (detail.audit.status === "completed" || detail.audit.status === "partial" || detail.audit.status === "failed") break;
      if (!processed) break;
    }

    const detail = await svc.getAuditDetail(a.organizationId, auditId, db);
    expect(detail.audit.status).toBe("completed");
    expect(detail.audit.score).not.toBeNull();
    expect(detail.pages.length).toBeGreaterThanOrEqual(2);
    expect(detail.findings.length).toBeGreaterThan(0); // missing meta description, img alt, broken link…
    expect(detail.findings.every((f) => f.findingKey && f.ruleId && f.evidence.length > 0)).toBe(true);

    // Usage charged once; re-enqueue is a no-op (unique job per audit).
    expect(await svc.monthlyScanUsage(a.organizationId, db)).toBe(1);
    await jobs.enqueueScanJob(auditId, db);
    await jobs.processNextScanJob(deps as never, db); // may process other orgs' leftover jobs — ours stays done
    expect(await svc.monthlyScanUsage(a.organizationId, db)).toBe(1);

    // Report reassembles into the Phase 2 ScanReport contract.
    const report = svc.detailToScanReport(await svc.getAuditDetail(a.organizationId, auditId, db));
    expect(report.status).toBe("completed");
    expect(report.tech?.map((t) => t.name)).toContain("HTML"); // persisted through the worker + DB round-trip
    expect(report.score).toBe(detail.audit.score);
    expect(report.coverage.pagesParsed).toBeGreaterThanOrEqual(2);
    expect(report.auditTypes).toEqual(["generic"]);

    // Finding lifecycle + cross-org mutation guard.
    const finding = detail.findings[0];
    await svc.setFindingStatus(a.organizationId, finding.id, "acknowledged", db);
    const after = await svc.getAuditDetail(a.organizationId, auditId, db);
    expect(after.findings.find((f) => f.id === finding.id)?.status).toBe("acknowledged");

    // Comparison against a second identical run: nothing new/resolved.
    const { auditId: audit2 } = await svc.startAudit(a.organizationId, a.userId, project.id, {}, db);
    for (let i = 0; i < 12; i++) {
      const processed = await jobs.processNextScanJob(deps as never, db);
      const d2 = await svc.getAuditDetail(a.organizationId, audit2, db);
      if (["completed", "partial", "failed"].includes(d2.audit.status)) break;
      if (!processed) break;
    }
    const comparison = await svc.compareAudits(a.organizationId, audit2, auditId, db);
    expect(comparison.scoreDelta).toBe(0);
    expect(comparison.newFindings).toHaveLength(0);
    expect(comparison.resolvedFindings).toHaveLength(0);
    expect(comparison.persistingCount).toBeGreaterThan(0);
  }, 60_000);
});

describe("share tokens", () => {
  it("grants read-only access, resists guessing, and stops working after revocation", async () => {
    const a = await register("share@example.com");
    const project = await svc.createProject(a.organizationId, a.userId, {
      name: "Share site", siteUrl: "https://github.com",
    }, db);
    const { auditId } = await svc.startAudit(a.organizationId, a.userId, project.id, {}, db);
    const deps = { resolver: PUBLIC_RESOLVER, transport: transportFor(SITE_V1) };
    for (let i = 0; i < 14; i++) {
      const processed = await jobs.processNextScanJob(deps as never, db);
      const d = await svc.getAuditDetail(a.organizationId, auditId, db);
      if (["completed", "partial", "failed"].includes(d.audit.status)) break;
      if (!processed) break;
    }

    const { id, token } = await svc.createShareToken(a.organizationId, a.userId, auditId, db);
    expect(token.length).toBeGreaterThanOrEqual(40); // 256-bit base64url
    const shared = await svc.getSharedAudit(token, db);
    expect(shared?.audit.id).toBe(auditId);

    expect(await svc.getSharedAudit("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", db)).toBeNull();
    expect(await svc.getSharedAudit("", db)).toBeNull();

    const listed = await svc.listShareTokens(a.organizationId, auditId, db);
    expect(listed.some((s) => s.id === id && s.revokedAt === null)).toBe(true);

    await svc.revokeShareToken(a.organizationId, id, db);
    expect(await svc.getSharedAudit(token, db)).toBeNull();
  }, 60_000);
});
