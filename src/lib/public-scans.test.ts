import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ScanReport } from "@/lib/scanner/types";

process.env.CLYVRO_DB_MEMORY = "1";
vi.mock("@/lib/scanner/fetcher", () => ({ fetchPublic: vi.fn() }));

type DB = import("@/lib/db").DB;
let db: DB;
let publicScanKey: typeof import("@/lib/services/public-scans").publicScanKey;
let recordPublicScan: typeof import("@/lib/services/public-scans").recordPublicScan;
let publicScans: typeof import("@/lib/db/schema").publicScans;
let auditsTable: typeof import("@/lib/db/schema").audits;
let registerAccount: typeof import("@/lib/services/accounts").registerAccount;
let createProject: typeof import("@/lib/services/audits").createProject;
let startAudit: typeof import("@/lib/services/audits").startAudit;

beforeAll(async () => {
  db = await (await import("@/lib/db")).createDb();
  const scans = await import("@/lib/services/public-scans");
  publicScanKey = scans.publicScanKey;
  recordPublicScan = scans.recordPublicScan;
  const schema = await import("@/lib/db/schema");
  publicScans = schema.publicScans;
  auditsTable = schema.audits;
  registerAccount = (await import("@/lib/services/accounts")).registerAccount;
  const svc = await import("@/lib/services/audits");
  createProject = svc.createProject;
  startAudit = svc.startAudit;
}, 60_000);

function report(overrides: Partial<ScanReport> = {}): ScanReport {
  return {
    status: "completed",
    target: "https://github.com/",
    finalUrl: "https://github.com/",
    startedAt: "2026-10-20T10:00:00.000Z",
    durationMs: 1234,
    rulesetVersion: "test",
    score: 80,
    findings: [{}, {}] as unknown as ScanReport["findings"],
    pages: [],
    coverage: {
      pagesFetched: 4,
      pagesParsed: 4,
      linksDiscovered: 10,
      linksChecked: 3,
      linksUnchecked: 7,
      formDestinationsChecked: 0,
      skippedByRobots: 0,
      truncatedPages: 0,
      maxPages: 10,
      maxDepth: 2,
      deadlineHit: false,
    },
    limitations: [],
    error: null,
    ...overrides,
  };
}

describe("public scan recording (homepage totals)", () => {
  it("derives a stable key from the finished report", () => {
    expect(publicScanKey(report())).toBe(publicScanKey(report()));
    expect(publicScanKey(report({ startedAt: "2026-10-20T11:00:00.000Z" }))).not.toBe(publicScanKey(report()));
  });

  it("records a completed public scan exactly once, even if the final slice is retried", async () => {
    const finished = report();
    expect(await recordPublicScan(finished, db)).toBe(true);
    expect(await recordPublicScan(finished, db)).toBe(false);
    const rows = await db.select().from(publicScans).where(eq(publicScans.scanKey, publicScanKey(finished)));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].pagesFetched).toBe(4);
    expect(rows[0].findingsCount).toBe(2);
  });

  it("never records a failed scan", async () => {
    const failed = report({ status: "failed", startedAt: "2026-10-20T12:00:00.000Z", score: null });
    expect(await recordPublicScan(failed, db)).toBe(false);
    const rows = await db.select().from(publicScans).where(eq(publicScans.scanKey, publicScanKey(failed)));
    expect(rows).toHaveLength(0);
  });

  it("counts a second, different scan as its own row", async () => {
    const other = report({ status: "partial", startedAt: "2026-10-20T13:00:00.000Z" });
    expect(await recordPublicScan(other, db)).toBe(true);
    const all = await db.select().from(publicScans);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

describe("scan-mode distinction", () => {
  it("persists strict and defaults to normal", async () => {
    const account = await registerAccount(
      { name: "Mode QA", email: "mode-qa@example.com", password: "a-long-password-123" },
      db,
    );
    const project = await createProject(
      account.organizationId,
      account.userId,
      { name: "Mode site", siteUrl: "https://github.com" },
      db,
    );

    const strict = await startAudit(account.organizationId, account.userId, project.id, { scanMode: "strict" }, db);
    const [strictRow] = await db.select().from(auditsTable).where(eq(auditsTable.id, strict.auditId));
    expect(strictRow.scanMode).toBe("strict");

    const normal = await startAudit(account.organizationId, account.userId, project.id, {}, db);
    const [normalRow] = await db.select().from(auditsTable).where(eq(auditsTable.id, normal.auditId));
    expect(normalRow.scanMode).toBe("normal");
  });
});
