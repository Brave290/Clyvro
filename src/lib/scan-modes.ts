import { planAtLeast, type Plan } from "@/lib/plans";

/**
 * Dashboard scan modes — crawl intensity only. The scoring formula is
 * identical in every mode, so reports stay comparable; what changes is
 * how much of the site the scanner looks at.
 *
 * - normal: the everyday check. Up to 25 pages (or the plan cap), 2 clicks
 *   deep, up to 20 extra link verifications.
 * - strict: the thorough check. The plan's full page budget, 3 clicks deep,
 *   and far more link verification — paid plans verify up to 1,000 internal
 *   links; free stays at 200 so upgrading visibly deepens coverage.
 * - deep (private, Pro+): owner-consented full-site coverage. Sitemap
 *   routes are enumerated as well as following links, 5 clicks deep, up to
 *   5,000 link verifications. Requires the user to confirm they own (or
 *   are authorized to deeply scan) the website. Pages behind a login are
 *   never accessed — we don't take credentials.
 *
 * The public /scan page offers no modes; it uses fixed SCAN_CONFIG bounds.
 */
export type ScanMode = "normal" | "strict" | "deep";

export const SCAN_MODES: ScanMode[] = ["normal", "strict", "deep"];

export function isScanMode(value: unknown): value is ScanMode {
  return value === "normal" || value === "strict" || value === "deep";
}

export const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  normal: "Normal",
  strict: "Strict",
  deep: "Deep (private)",
};

export const SCAN_MODE_BLURBS: Record<ScanMode, string> = {
  normal: "Everyday check — up to 25 pages, 2 clicks deep.",
  strict: "Thorough check — your plan's full page budget, 3 clicks deep, internal links verified in bulk.",
  deep: "Full-site private scan — your sitemap plus every internal link, 5 clicks deep. For sites you own. Takes longest.",
};

export interface ScanLimits {
  maxPages: number;
  maxLinkChecks: number;
  maxDepth: number;
}

/** Engine hard ceilings (crawl.ts / checkpoint validation clamp to the same numbers). */
const CEILINGS = { maxPages: 2000, maxLinkChecks: 5000, maxDepth: 5 };

/**
 * Network operations per worker slice. Deep scans get a much larger slice
 * budget than the historical flat 8 — at 8 ops/slice a 2,000-page deep
 * scan needed ~900 sequential slices and appeared stuck for hours.
 */
export function workBudgetForMode(mode: ScanMode): number {
  if (mode === "deep") return 80;
  if (mode === "strict") return 40;
  return 12;
}

export function scanLimitsForMode(mode: ScanMode, plan: Plan): ScanLimits {
  if (mode === "deep") {
    return {
      maxPages: Math.min(plan.maxPagesPerScan, CEILINGS.maxPages),
      maxLinkChecks: CEILINGS.maxLinkChecks,
      maxDepth: CEILINGS.maxDepth,
    };
  }
  if (mode === "strict") {
    return {
      maxPages: Math.min(plan.maxPagesPerScan, CEILINGS.maxPages),
      // Paid plans verify links in bulk; free gets a smaller taste.
      maxLinkChecks: planAtLeast(plan, "basic") ? 1000 : 200,
      maxDepth: 3,
    };
  }
  return {
    maxPages: Math.min(plan.maxPagesPerScan, 25),
    maxLinkChecks: 20,
    maxDepth: 2,
  };
}
