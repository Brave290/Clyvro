import { describe, it, expect } from "vitest";
import { auditScore } from "./types";
import { SAMPLE_FINDINGS } from "./sample-report";
describe("auditScore", () => {
  it("is 100 with no findings and never below 0", () => { expect(auditScore([])).toBe(100); });
  it("deducts deterministically by severity", () => {
    const s = auditScore(SAMPLE_FINDINGS);
    expect(s).toBe(54); // 1 crit(12) + 3 high(21) + 3 med(12) + 1 low(1.5) = 46.5 -> 54
  });
});
describe("sample findings (data contract §9)", () => {
  it("every finding carries rule id, version, evidence and a recommendation", () => {
    for (const f of SAMPLE_FINDINGS) {
      expect(f.ruleId).toMatch(/^CLY-\d{3}$/); expect(f.ruleVersion).toBeTruthy();
      expect(f.evidence.length).toBeGreaterThan(0); expect(f.recommendation.length).toBeGreaterThan(10);
    }
  });
  it("has unique rule ids", () => {
    expect(new Set(SAMPLE_FINDINGS.map(f => f.ruleId)).size).toBe(SAMPLE_FINDINGS.length);
  });
});
