import { describe, expect, it } from "vitest";
import { buildTopFixes, fullScanToAgentPrompt, fullScanToMarkdown, type FullStages } from "@/lib/full-scan-shared";
import { PLANS } from "@/lib/plans";
import { premiumAccess } from "@/lib/services/tool-access";
import { FULL_SCAN_STALE_MS, fullScanStaleReason, getFullScan } from "@/lib/services/full-scan";

const STAGES: FullStages = {
  audit: {
    status: "done", score: 72, findings: 3, pages: 6,
    topFindings: [{ ruleId: "CLY-099", severity: "medium", title: "Missing security headers", page: "Site-wide", recommendation: "Add the headers." }],
  },
  flow: {
    status: "done", scanId: "fx1", pages: 4, notes: 2,
    flaws: [{ title: "CTA below the fold", evidence: "(desktop) CTA at y=1400", recommendation: "Move it up." }],
  },
  ai: { status: "done", checkId: "a1", score: 61, band: "generic", topSignals: ["Generic AI-style phrasing (3 phrases)"] },
  readiness: { status: "done", checkId: "r1", tier: "basic", pass: 8, warn: 2, fail: 1, topFails: ["SPF record missing"] },
};

describe("Full Scan bundle", () => {
  it("plan allowances: Free/Basic excluded, Pro and Ultra unlimited", async () => {
    const byId = Object.fromEntries(PLANS.map((p) => [p.id, p.fullScan]));
    expect(byId.freemium).toMatchObject({ count: 0 });
    expect(byId.basic).toMatchObject({ count: 0 });
    expect(byId.pro).toBeNull();
    expect(byId["ultra-agency"]).toBeNull();
  });

  it("premiumAccess reports full-scan honestly on a free workspace (limit 0, not allowed)", async () => {
    process.env.CLYVRO_DB_MEMORY = "1";
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const a = await accounts.registerAccount(
      { name: "Free", email: "full-free@example.com", password: "a-long-password-123" }, db);
    const access = await premiumAccess(a.organizationId, "full-scan", db);
    expect(access.allowed).toBe(false);
    expect(access.limit).toBe(0);
    expect(access.remaining).toBe(0);
  });

  it("merged Top Fixes rank the browser flaw above medium audit items and dedupe", () => {
    const fixes = buildTopFixes(STAGES);
    expect(fixes[0].source).toBe("Flow Scan");
    expect(fixes.some((f) => f.title.includes("CLY-099"))).toBe(true);
    expect(fixes.some((f) => f.source === "AI-Pattern")).toBe(true);
    expect(fixes.length).toBeLessThanOrEqual(12);
  });

  it("exports carry the scoreboard; a failed stage is reported, never hidden", () => {
    const md = fullScanToMarkdown("https://acme.example/", STAGES);
    expect(md).toContain("72/100");
    expect(md).toContain("Top fixes");
    expect(md).toContain("strict security");
    const prompt = fullScanToAgentPrompt("https://acme.example/", STAGES);
    expect(prompt).toContain("Clyvro Full Scan");
    const broken: FullStages = { ...STAGES, flow: { status: "failed", error: "browser unavailable", scanId: null, pages: 0, flaws: [], notes: 0 } };
    expect(fullScanToMarkdown("https://acme.example/", broken)).toContain("browser unavailable");
    expect(buildTopFixes(broken).some((f) => f.source === "Flow Scan")).toBe(false);
  });

  it("stale-reason: a running row with no heartbeat for 4+ minutes is dead; a live one is not", () => {
    const now = 1_700_000_000_000;
    const old = new Date(now - 20 * 60_000).toISOString();
    expect(fullScanStaleReason({
      status: "running", createdAt: old,
      steps: [{ at: old, label: "Stage 1 of 5 — Full-site audit…", level: "step" }],
    }, now)).toMatch(/cut off/);
    expect(FULL_SCAN_STALE_MS).toBe(4 * 60 * 1000);
    expect(fullScanStaleReason({
      status: "running", createdAt: new Date(now - 30_000).toISOString(),
      steps: [{ at: new Date(now - 10_000).toISOString(), label: "Stage 1 still crawling", level: "step" }],
    }, now)).toBeNull();
    expect(fullScanStaleReason({
      status: "queued", createdAt: new Date(now - 2 * 60_000).toISOString(), steps: [],
    }, now)).toMatch(/never started/);
    expect(fullScanStaleReason({
      status: "completed", createdAt: old, steps: [],
    }, now)).toBeNull();
  });

  it("getFullScan marks a stuck running row failed instead of leaving the spinner up forever", async () => {
    process.env.CLYVRO_DB_MEMORY = "1";
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const a = await accounts.registerAccount(
      { name: "Stuck", email: "full-stale@example.com", password: "a-long-password-123" }, db);
    const schema = await import("@/lib/db/schema");
    const started = new Date(Date.now() - 20 * 60_000);
    await db.insert(schema.fullScans).values({
      id: "fs_stale_hang",
      organizationId: a.organizationId,
      requestedBy: a.userId,
      targetUrl: "https://example.com/",
      status: "running",
      steps: [{ at: started.toISOString(), label: "Stage 1 of 5 — Full-site audit…", level: "step" }],
      createdAt: started,
    });
    const row = await getFullScan(a.organizationId, "fs_stale_hang", db);
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toMatch(/cut off/);
    expect(row.finishedAt).toBeTruthy();
  });
});
