import { describe, it, expect } from "vitest";
import { reportFileSlug, reportToAgentBrief, reportToMarkdown } from "./report-export";
import type { ScanReport } from "./scanner/types";

const report: ScanReport = {
  status: "completed",
  target: "https://www.acme.example/",
  finalUrl: "https://acme.example/",
  startedAt: "2026-10-20T09:00:00.000Z",
  durationMs: 4200,
  rulesetVersion: "1.2.0",
  score: 71,
  findings: [{
    ruleId: "CLY-075", ruleVersion: "1.2.0", page: "/", category: "Reliability",
    severity: "high", confidenceBasis: "confirmed",
    title: "Mixed content", explanation: "An http image loads on an https page.",
    evidence: ["/ — http://cdn.example/a.jpg"], recommendation: "Serve it over https.",
    effort: "Minutes", impactRationale: "Browsers may block it.",
  }],
  pages: [],
  coverage: {
    pagesFetched: 3, pagesParsed: 3, linksDiscovered: 9, linksChecked: 4, linksUnchecked: 5,
    formDestinationsChecked: 1, skippedByRobots: 0, truncatedPages: 0,
    maxPages: 25, maxDepth: 2, deadlineHit: false,
  },
  limitations: ["We never submit forms."],
  error: null,
};

describe("report exports", () => {
  it("slug uses the final host and date", () => {
    expect(reportFileSlug(report)).toBe("clyvro-scan-acme.example-2026-10-20");
  });
  it("markdown carries evidence, coverage, limitations — but no score formula", () => {
    const md = reportToMarkdown(report);
    expect(md).toContain("CLY-075");
    expect(md).toContain("http://cdn.example/a.jpg");
    expect(md).toContain("Pages fetched: 3");
    expect(md).toContain("We never submit forms.");
    expect(md).not.toMatch(/100\s*(−|-)\s*\(12/);
    expect(md.toLowerCase()).not.toContain("deduction");
  });
  it("agent brief is fix-oriented and self-contained", () => {
    const brief = reportToAgentBrief(report);
    expect(brief).toContain("CLY-075");
    expect(brief).toContain("Serve it over https.");
  });
});
