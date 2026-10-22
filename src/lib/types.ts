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

/** Stricter Full Scan / Pro security score — any gap costs more. */
export const STRICT_DEDUCTION: Record<Severity, number> = { critical: 20, high: 12, medium: 6, low: 3 };
export function strictSecurityScore(findings: Finding[], extraFails = 0, extraWarns = 0): number {
  const raw = 100
    - findings.reduce((sum, f) => sum + STRICT_DEDUCTION[f.severity], 0)
    - extraFails * 10
    - extraWarns * 4;
  return Math.max(0, Math.round(raw));
}
export function confidenceLabel(b: ConfidenceBasis): string {
  return b === "confirmed" ? "Confirmed — directly observed" : b === "measured" ? "Measured — lab data" : "Heuristic — needs review";
}
