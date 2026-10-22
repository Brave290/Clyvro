import { describe, it, expect } from "vitest";
import { auditScore, confidenceLabel, strictSecurityScore, type Finding } from "./types";

const finding = (severity: Finding["severity"]): Finding => ({
  ruleId: "CLY-999", ruleVersion: "test", page: "/", category: "Reliability", severity,
  confidenceBasis: "confirmed", title: "Fixture finding title used by tests",
  explanation: "Fixture explanation for the scoring unit tests only.",
  evidence: ["fixture evidence"], recommendation: "Fixture recommendation text.",
  effort: "Minutes", impactRationale: "Fixture rationale.",
});

describe("auditScore", () => {
  it("is 100 with no findings", () => { expect(auditScore([])).toBe(100); });
  it("deducts deterministically by severity", () => {
    // 1 crit(12) + 3 high(21) + 3 med(12) + 1 low(1.5) = 46.5 -> 54
    const s = auditScore([finding("critical"), finding("high"), finding("high"), finding("high"), finding("medium"), finding("medium"), finding("medium"), finding("low")]);
    expect(s).toBe(54);
  });
  it("never goes below 0", () => {
    expect(auditScore(Array.from({ length: 20 }, () => finding("critical")))).toBe(0);
  });
});
describe("strictSecurityScore", () => {
  it("deducts more than the audit score and counts extra lock fails", () => {
    expect(strictSecurityScore([])).toBe(100);
    expect(strictSecurityScore([finding("critical")])).toBe(80);
    expect(strictSecurityScore([], 2, 1)).toBe(76);
    expect(strictSecurityScore(Array.from({ length: 20 }, () => finding("critical")))).toBe(0);
  });
});
describe("confidenceLabel", () => {
  it("labels each basis distinctly", () => {
    expect(confidenceLabel("confirmed")).toMatch(/Confirmed/);
    expect(confidenceLabel("measured")).toMatch(/Measured/);
    expect(confidenceLabel("heuristic")).toMatch(/Heuristic/);
  });
});
