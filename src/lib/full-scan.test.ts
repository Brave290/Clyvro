import { describe, expect, it } from "vitest";
import { buildTopFixes, fullScanToAgentPrompt, fullScanToMarkdown, type FullStages } from "@/lib/full-scan-shared";
import { PLANS } from "@/lib/plans";
import { premiumAccess } from "@/lib/services/tool-access";

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
});
