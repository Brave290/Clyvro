/**
 * Subscription plan catalogue & entitlements.
 *
 * Prices are the founder's starting prices in USD (canonical; the billing
 * module maps them to fixed per-currency amounts). Checkout activates
 * when Flutterwave keys are present — until then the billing page says
 * so honestly and never fakes a payment. Entitlements are always
 * enforced server-side.
 */

export type AuditType =
  | "generic"
  | "technical-seo"
  | "accessibility"
  | "conversion-ux"
  | "security-config";

export const AUDIT_TYPES: { id: AuditType; name: string; blurb: string }[] = [
  { id: "generic", name: "Generic audit", blurb: "The full rule set across every category." },
  { id: "technical-seo", name: "Technical SEO", blurb: "Titles, meta descriptions, headings, broken internal links." },
  { id: "accessibility", name: "Accessibility", blurb: "Alt text, form labels, viewport, page language. Partial automated coverage — not a certification." },
  { id: "conversion-ux", name: "Conversion & UX", blurb: "Call-to-action signals and form-destination health. Heuristics labelled for human review." },
  { id: "security-config", name: "Security configuration", blurb: "Safe external observations only (e.g. sensitive forms over HTTP, mixed content). Not penetration testing." },
];

export type PlanId = "freemium" | "basic" | "pro" | "ultra-agency";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price, USD (canonical; billing converts via its fixed table). */
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
  /** Private deep scans: sitemap-wide, owner-consented full-site coverage. */
  deepScans: boolean;
  /** Project Readiness access: 24h trial from first use, basic set, or full set. */
  readiness: "trial" | "basic" | "full";
  /** Customer HTTP cron jobs (our own scheduler). */
  maxCronJobs: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "freemium", name: "Freemium", tagline: "For founders trying Clyvro for the first time.",
    monthlyPriceUsd: 0, scansPerMonth: 3, maxPagesPerScan: 10, maxProjects: 1,
    auditTypes: ["generic"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    deepScans: false, readiness: "trial", maxCronJobs: 1,
    features: ["3 scans per month", "Up to 10 pages per scan", "Generic technical audit", "Findings with evidence and fixes", "Downloadable reports (Markdown & PDF)", "24-hour Project Readiness trial", "1 cron job"],
  },
  {
    id: "basic", name: "Basic", tagline: "For freelancers and individual website owners.",
    monthlyPriceUsd: 19, scansPerMonth: 60, maxPagesPerScan: 250, maxProjects: 5,
    auditTypes: ["generic", "technical-seo", "accessibility"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    deepScans: false, readiness: "trial", maxCronJobs: 10,
    features: ["60 scans per month", "Up to 250 pages per scan", "Technical SEO, metadata, links and accessibility checks", "Audit history, comparisons and exports", "Up to 5 projects", "10 cron jobs"],
  },
  {
    id: "pro", name: "Pro", tagline: "For consultants and growing businesses.",
    monthlyPriceUsd: 49, scansPerMonth: 300, maxPagesPerScan: 1000, maxProjects: 25,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 3, whiteLabel: false,
    deepScans: true, readiness: "basic", maxCronJobs: 50,
    features: ["300 scans per month", "Up to 1,000 pages per scan", "Private deep scans — every route in your sitemap (owner-consented)", "Project Readiness checks (basic)", "Expanded audit categories", "Scheduled monitoring and fix verification", "Up to 25 projects · 50 cron jobs"],
  },
  {
    id: "ultra-agency", name: "Ultra Agency", tagline: "For agencies managing multiple clients.",
    monthlyPriceUsd: 129, scansPerMonth: 1500, maxPagesPerScan: 2000, maxProjects: 200,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 10, whiteLabel: true,
    deepScans: true, readiness: "full", maxCronJobs: 200,
    features: ["1,500 scans per month", "Up to 2,000 pages per scan", "Private deep scans with the highest limits", "Project Readiness — full super-strict checks", "Client workspaces and 10 team seats", "White-label reports and branded share links", "200 cron jobs", "Priority support"],
  },
];

export function getPlan(planId: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0];
}

/**
 * The plan an organization is effectively on. A paid plan whose paid
 * period has lapsed (organizations.planExpiresAt in the past) drops to
 * Freemium until renewed — no silent lock-in, no surprise charges.
 * Dev-only override: CLYVRO_DEV_PLAN=pro npm run dev.
 */
export function effectivePlan(
  orgPlanId: string | null | undefined,
  planExpiresAt?: Date | string | null,
): Plan {
  if (process.env.NODE_ENV !== "production" && process.env.CLYVRO_DEV_PLAN) {
    return getPlan(process.env.CLYVRO_DEV_PLAN);
  }
  const plan = getPlan(orgPlanId);
  if (plan.id !== "freemium" && planExpiresAt) {
    const expiry = planExpiresAt instanceof Date ? planExpiresAt.getTime() : Date.parse(planExpiresAt);
    if (Number.isFinite(expiry) && expiry <= Date.now()) return PLANS[0];
  }
  return plan;
}

/** Rank for "is at least plan X" comparisons (entitlement gates). */
export const PLAN_RANK: Record<PlanId, number> = { freemium: 0, basic: 1, pro: 2, "ultra-agency": 3 };
export function planAtLeast(plan: Plan, minimum: PlanId): boolean {
  return PLAN_RANK[plan.id] >= PLAN_RANK[minimum];
}

export function planAllowsAuditTypes(plan: Plan, requested: AuditType[]): { ok: boolean; denied: AuditType[] } {
  const denied = requested.filter((t) => !plan.auditTypes.includes(t));
  return { ok: denied.length === 0, denied };
}
