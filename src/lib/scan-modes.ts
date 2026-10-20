import type { Plan } from "@/lib/plans";

/**
 * Dashboard scan modes — crawl intensity only. The scoring formula is
 * identical in both modes, so Normal and Strict reports stay comparable;
 * what changes is how much of the site the scanner looks at.
 *
 * - normal: the everyday check. Up to 25 pages (or the plan cap, whichever
 *   is smaller), 2 clicks deep, up to 20 extra link verifications.
 * - strict: the deep check. The plan's full page budget, 3 clicks deep,
 *   and every internal link it finds verified (bounded by the same
 *   wall-clock safety deadline — if time runs out, the report's coverage
 *   section says so honestly via deadlineHit).
 *
 * The public /scan page does not offer modes; it always uses the fixed
 * safe defaults from SCAN_CONFIG.
 */
export type ScanMode = "normal" | "strict";

export const SCAN_MODES: ScanMode[] = ["normal", "strict"];

export function isScanMode(value: unknown): value is ScanMode {
  return value === "normal" || value === "strict";
}

export const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  normal: "Normal",
  strict: "Strict",
};

export const SCAN_MODE_BLURBS: Record<ScanMode, string> = {
  normal: "Everyday check — up to 25 pages, 2 clicks deep.",
  strict: "Deep check — your plan's full page budget, 3 clicks deep, every internal link verified. Takes longer.",
};

export interface ScanLimits {
  maxPages: number;
  maxLinkChecks: number;
  maxDepth: number;
}

/** Hard safety ceilings; the scanner clamps to these regardless of input. */
const CEILINGS = { maxDepth: 3, maxLinkChecks: 200 };

export function scanLimitsForMode(mode: ScanMode, plan: Plan): ScanLimits {
  if (mode === "strict") {
    return {
      maxPages: plan.maxPagesPerScan,
      maxLinkChecks: CEILINGS.maxLinkChecks,
      maxDepth: CEILINGS.maxDepth,
    };
  }
  return {
    maxPages: Math.min(plan.maxPagesPerScan, 25),
    maxLinkChecks: 20,
    maxDepth: 2,
  };
}
