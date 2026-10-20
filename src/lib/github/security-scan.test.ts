import { describe, expect, it } from "vitest";
import { scanRepositorySecurity, type AdvisoryQuery } from "./security-scan";

describe("repository security scan", () => {
  it("reports secret location and redacted evidence without retaining the value", async () => {
    const secret = "sk_live_1234567890abcdefghijkl";
    const report = await scanRepositorySecurity([
      { path: "config/prod.ts", content: `const STRIPE_KEY = "${secret}";\n` },
    ]);
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.rule).toBe("stripe-live-key");
    expect(finding.path).toBe("config/prod.ts");
    expect(finding.line).toBe(1);
    expect(JSON.stringify(finding)).not.toContain(secret);
    expect(finding.evidence.join(" ")).toMatch(/redacted/i);
    expect(finding.confidenceBasis).toMatch(/heuristic/i);
  });

  it("extracts v2/v3 npm entries, batches bounded queries, and deduplicates advisories", async () => {
    const calls: AdvisoryQuery[][] = [];
    const report = await scanRepositorySecurity([
      {
        path: "package-lock.json",
        content: JSON.stringify({
          name: "fixture",
          lockfileVersion: 3,
          packages: {
            "": { name: "fixture", version: "1.0.0" },
            "node_modules/left-pad": { version: "1.3.0" },
            "node_modules/@scope/tool": { version: "2.0.0" },
            "node_modules/parent/node_modules/left-pad": { version: "1.3.0" },
          },
        }),
      },
    ], {
      limits: { advisoryBatchSize: 1 },
      advisoryLookup: async (queries) => {
        calls.push([...queries]);
        return {
          results: queries.map((query) => ({
            vulns: query.package.name === "left-pad" ? [{ id: "OSV-LEFT-PAD", severity: [{ type: "CVSS", score: "HIGH" }] }] : [],
          })),
        };
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls.flat()).toEqual([
      { package: { ecosystem: "npm", name: "@scope/tool" }, version: "2.0.0" },
      { package: { ecosystem: "npm", name: "left-pad" }, version: "1.3.0" },
    ]);
    expect(report.coverage.advisoryAvailability).toBe("complete");
    expect(report.findings.filter((finding) => finding.advisoryId === "OSV-LEFT-PAD")).toHaveLength(1);
    expect(report.findings[0].severity).toBe("high");
  });

  it("does not expose source content to the advisory lookup and reports partial failures", async () => {
    let received: AdvisoryQuery[] = [];
    const report = await scanRepositorySecurity([
      { path: "src/secret.ts", content: "DO_NOT_SEND_THIS_SOURCE" },
      {
        path: "package-lock.json",
        content: JSON.stringify({ lockfileVersion: 2, packages: { "node_modules/pkg": { version: "1.0.0" } } }),
      },
    ], async (queries) => {
      received = [...queries];
      throw new Error("offline");
    });

    expect(JSON.stringify(received)).not.toContain("DO_NOT_SEND_THIS_SOURCE");
    expect(report.coverage.advisoryAvailability).toBe("unavailable");
    expect(report.limitations.join(" ")).toMatch(/unavailable/i);
    expect(report.findings).toEqual([]);
  });

  it("marks missing advisory integration explicitly and keeps source checks local", async () => {
    const report = await scanRepositorySecurity([
      { path: "package-lock.json", content: JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/pkg": { version: "1.0.0" } } }) },
    ]);
    expect(report.coverage.advisoryAvailability).toBe("not-configured");
    expect(report.coverage.limitations.join(" ")).toMatch(/no advisory lookup/i);
  });
});
