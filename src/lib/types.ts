export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "Conversion" | "Performance" | "SEO & discoverability" | "Accessibility" | "Reliability";
export type ConfidenceBasis = "confirmed" | "measured" | "heuristic";
export interface Finding {
  ruleId: string; ruleVersion: string; page: string; category: Category; severity: Severity;
  confidenceBasis: ConfidenceBasis; title: string; explanation: string;
  evidence: string[]; recommendation: string; effort: "Minutes" | "Hours" | "Days";
  impactRationale: string;
}
/**
 * Audit score — deterministic, documented (master spec §9).
 * Start at 100, subtract per finding by severity. This is an internal
 * audit score only — NOT a conversion rate or revenue prediction.
 */
export const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 12, high: 7, medium: 4, low: 1.5 };
export function auditScore(findings: Finding[]): number {
  const raw = 100 - findings.reduce((sum, f) => sum + SEVERITY_DEDUCTION[f.severity], 0);
  return Math.max(0, Math.round(raw));
}
export function confidenceLabel(b: ConfidenceBasis): string {
  return b === "confirmed" ? "Confirmed — directly observed" : b === "measured" ? "Measured — lab data" : "Heuristic — needs review";
}
