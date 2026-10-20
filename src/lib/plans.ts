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
  /** AI-Pattern & Generic-ness detector (pattern likelihood, never authorship proof). Pro and Ultra only. */
  aiDetector: boolean;
  /** Customer HTTP cron jobs (our own scheduler). */
  maxCronJobs: number;
  /**
   * Tool run allowances (Hack Protection, SEO Visibility, and
   * the five Developer Tools). `null` = unlimited. Freemium allowances
   * are lifetime tastes (try it, see it work, then upgrade); paid tiers
   * are monthly. Enforced server-side in services/tool-access.ts.
   */
  tools: {
    hackSeo: { count: number; period: "lifetime" | "monthly" } | null;
    devTools: { count: number; period: "lifetime-per-tool" | "monthly-pooled" } | null;
  };
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "freemium", name: "Freemium", tagline: "For founders trying Clyvro for the first time.",
    monthlyPriceUsd: 0, scansPerMonth: 10, maxPagesPerScan: 10, maxProjects: 1,
    auditTypes: ["generic"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    deepScans: false, readiness: "trial", aiDetector: false, maxCronJobs: 1,
    tools: { hackSeo: { count: 2, period: "lifetime" }, devTools: { count: 3, period: "lifetime-per-tool" } },
    features: ["10 scans per month", "Up to 10 pages per scan", "Generic technical audit", "Findings with evidence and fixes", "Downloadable reports (Markdown & PDF)", "24-hour Project Readiness trial", "Hack Protection & SEO Visibility - 2 free runs each", "Developer Tools - 3 free runs per tool", "1 cron job"],
  },
  {
    id: "basic", name: "Basic", tagline: "For freelancers and individual website owners.",
    monthlyPriceUsd: 19, scansPerMonth: 60, maxPagesPerScan: 250, maxProjects: 5,
    auditTypes: ["generic", "technical-seo", "accessibility"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    deepScans: false, readiness: "trial", aiDetector: false, maxCronJobs: 10,
    tools: { hackSeo: { count: 5, period: "monthly" }, devTools: { count: 20, period: "monthly-pooled" } },
    features: ["60 scans per month", "Up to 250 pages per scan", "Technical SEO, metadata, links and accessibility checks", "Audit history, comparisons and exports", "Hack Protection & SEO Visibility - 5 runs/month each", "Developer Tools - 20 runs/month", "Up to 5 projects", "10 cron jobs"],
  },
  {
    id: "pro", name: "Pro", tagline: "For consultants and growing businesses.",
    monthlyPriceUsd: 49, scansPerMonth: 300, maxPagesPerScan: 1000, maxProjects: 25,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 3, whiteLabel: false,
    deepScans: true, readiness: "basic", aiDetector: true, maxCronJobs: 50,
    tools: { hackSeo: { count: 30, period: "monthly" }, devTools: { count: 100, period: "monthly-pooled" } },
    features: ["300 scans per month", "Up to 1,000 pages per scan", "Private deep scans — every route in your sitemap (owner-consented)", "Project Readiness checks (basic)", "AI-Pattern & Generic-ness detector with agent fix prompt", "Expanded audit categories", "Hack Protection & SEO Visibility - 30 runs/month each", "Developer Tools - 100 runs/month", "Scheduled monitoring and fix verification", "Up to 25 projects · 50 cron jobs"],
  },
  {
    id: "ultra-agency", name: "Ultra Agency", tagline: "For agencies managing multiple clients.",
    monthlyPriceUsd: 129, scansPerMonth: 1500, maxPagesPerScan: 2000, maxProjects: 200,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 10, whiteLabel: true,
    deepScans: true, readiness: "full", aiDetector: true, maxCronJobs: 200,
    tools: { hackSeo: null, devTools: null },
    features: ["1,500 scans per month", "Up to 2,000 pages per scan", "Private deep scans with the highest limits", "Project Readiness — full super-strict checks", "AI-Pattern & Generic-ness detector with agent fix prompt", "Client workspaces and 10 team seats", "White-label reports and branded share links", "Hack Protection, SEO Visibility & Developer Tools - unlimited, no counters", "200 cron jobs", "Priority support"],
  },
];

export function getPlan(planId: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0];
}

/**
 * The plan an organization is effectively on. A paid plan whose paid
 * period has lapsed (organizations.planExpiresAt in the past) drops to
 * Freemium until renewed — no silent lock-in, no surprise charges.
 * `planExpiresAt = null` on a paid plan means the grant never expires
 * (freemium, or a deliberate life grant such as the founder's).
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

/**
 * Org-aware plan resolution. Precedence:
 * 1. Dev override (non-production only).
 * 2. `adminPlanId` — an administrator-granted override, explicitly labelled
 *    and kept DISTINCT from the purchased subscription (never settable by
 *    the customer; recorded with note/actor in the admin log).
 * 3. The purchased plan (`planId` + `planExpiresAt`); lapsed purchases
 *    degrade to Freemium.
 */
export function effectivePlanForOrg(org: {
  planId: string | null | undefined;
  planExpiresAt?: Date | string | null;
  adminPlanId?: string | null;
}): Plan {
  if (process.env.NODE_ENV !== "production" && process.env.CLYVRO_DEV_PLAN) {
    return getPlan(process.env.CLYVRO_DEV_PLAN);
  }
  if (org.adminPlanId) {
    const granted = PLANS.find((p) => p.id === org.adminPlanId);
    if (granted) return granted;
  }
  return effectivePlan(org.planId, org.planExpiresAt);
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
