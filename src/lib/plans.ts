/**
 * Subscription plan catalogue & entitlements (Phase 3 foundation).
 *
 * Prices are PROPOSED starting prices in USD — not validated, not yet
 * purchasable. Billing/checkout/webhooks arrive in Phase 6. Everything
 * here is configuration, so prices/limits can change without touching
 * business logic. Entitlements are always enforced server-side.
 */

export type AuditType =
  | "generic"
  | "technical-seo"
  | "accessibility"
  | "conversion-ux"
  | "security-config";

export const AUDIT_TYPES: { id: AuditType; name: string; blurb: string }[] = [
  { id: "generic", name: "Generic audit", blurb: "The full Phase 2 rule set across every category." },
  { id: "technical-seo", name: "Technical SEO", blurb: "Titles, meta descriptions, headings, broken internal links." },
  { id: "accessibility", name: "Accessibility", blurb: "Alt text, form labels, viewport, page language. Partial automated coverage — not a certification." },
  { id: "conversion-ux", name: "Conversion & UX", blurb: "Call-to-action signals and form-destination health. Heuristics labelled for human review." },
  { id: "security-config", name: "Security configuration", blurb: "Safe external observations only (e.g. sensitive forms over HTTP). Not penetration testing." },
];

export type PlanId = "freemium" | "basic" | "pro" | "ultra-agency";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Proposed monthly price, USD. Billing is not active yet. */
  monthlyPriceUsd: number;
  scansPerMonth: number;
  maxPagesPerScan: number;
  maxProjects: number;
  /** Audit types beyond "generic" this plan may select ("generic" is always included). */
  auditTypes: AuditType[];
  exports: boolean;
  monitoring: boolean;
  teamSeats: number;
  whiteLabel: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "freemium", name: "Freemium", tagline: "For founders trying Clyvro for the first time.",
    monthlyPriceUsd: 0, scansPerMonth: 3, maxPagesPerScan: 10, maxProjects: 1,
    auditTypes: ["generic"], exports: false, monitoring: false, teamSeats: 1, whiteLabel: false,
    features: ["3 scans per month", "Up to 10 pages per scan", "Generic technical audit", "Basic findings and recommended fixes", "Clyvro-branded reports", "No scheduled monitoring"],
  },
  {
    id: "basic", name: "Basic", tagline: "For freelancers and individual website owners.",
    monthlyPriceUsd: 19, scansPerMonth: 25, maxPagesPerScan: 100, maxProjects: 3,
    auditTypes: ["generic", "technical-seo", "accessibility"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    features: ["25 scans per month", "Up to 100 pages per scan", "Technical SEO, metadata, links and accessibility checks", "Audit history and report exports", "Up to 3 projects"],
  },
  {
    id: "pro", name: "Pro", tagline: "For consultants and growing businesses.",
    monthlyPriceUsd: 49, scansPerMonth: 100, maxPagesPerScan: 500, maxProjects: 10,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 3, whiteLabel: false,
    features: ["100 scans per month", "Up to 500 pages per scan", "Expanded audit categories", "Scheduled monitoring and fix verification", "Prioritized fix plans and historical comparisons", "Up to 10 projects"],
  },
  {
    id: "ultra-agency", name: "Ultra Agency", tagline: "For agencies managing multiple clients.",
    monthlyPriceUsd: 129, scansPerMonth: 500, maxPagesPerScan: 1000, maxProjects: 100,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 10, whiteLabel: true,
    features: ["500 scans per month", "Higher page and crawl limits", "Client workspaces and multiple team seats", "White-label PDF reports and branded share links", "Bulk audits and reusable client report templates", "Client notes and scheduled reporting", "Priority support"],
  },
];

export function getPlan(planId: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0];
}

/** Dev-only entitlement override: CLYVRO_DEV_PLAN=pro npm run dev. Ignored in production builds. */
export function effectivePlan(orgPlanId: string | null | undefined): Plan {
  if (process.env.NODE_ENV !== "production" && process.env.CLYVRO_DEV_PLAN) {
    return getPlan(process.env.CLYVRO_DEV_PLAN);
  }
  return getPlan(orgPlanId);
}

export function planAllowsAuditTypes(plan: Plan, requested: AuditType[]): { ok: boolean; denied: AuditType[] } {
  const denied = requested.filter((t) => !plan.auditTypes.includes(t));
  return { ok: denied.length === 0, denied };
}
