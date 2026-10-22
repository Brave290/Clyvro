export type AuditType =
  | "generic"
  | "technical-seo"
  | "accessibility"
  | "conversion-ux"
  | "security-config";

export const AUDIT_TYPES: { id: AuditType; name: string; blurb: string }[] = [
  { id: "generic", name: "Full website health check", blurb: "Everything in one go — links, pages, forms, Google, phone layout." },
  { id: "technical-seo", name: "Get found on Google", blurb: "Your titles, descriptions, headings — what Google actually shows when people search for you." },
  { id: "accessibility", name: "Works for everyone", blurb: "Can blind customers, keyboard-only users, and phone users actually use your site?" },
  { id: "conversion-ux", name: "Turns visitors into customers", blurb: "Does your page make it obvious what to do next — buy, book, call — or do people get confused and leave?" },
  { id: "security-config", name: "Basic safety locks", blurb: "We look from outside only: is private info sent safely, are obvious doors left open? (We don't try to break in.)" },
];

export type PlanId = "freemium" | "basic" | "pro" | "ultra-agency";

export type RunAllowance = { count: number; period: "lifetime" | "monthly" } | null;

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPriceUsd: number;
  scansPerMonth: number;
  maxPagesPerScan: number;
  maxProjects: number;
  auditTypes: AuditType[];
  exports: boolean;
  monitoring: boolean;
  teamSeats: number;
  whiteLabel: boolean;
  deepScans: RunAllowance;
  readiness: "trial" | "basic" | "full";
  aiDetector: RunAllowance;
  flowScan: RunAllowance;
  fullScan: RunAllowance;
  maxCronJobs: number;
  tools: {
    hackSeo: { count: number; period: "lifetime" | "monthly" } | null;
    devTools: { count: number; period: "lifetime-per-tool" | "monthly-pooled" } | null;
  };
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "freemium", name: "Free", tagline: "Try it on your own site — see what's broken, for free.",
    monthlyPriceUsd: 0, scansPerMonth: 10, maxPagesPerScan: 10, maxProjects: 1,
    auditTypes: ["generic"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    deepScans: { count: 1, period: "lifetime" }, readiness: "trial", aiDetector: { count: 2, period: "lifetime" }, flowScan: { count: 1, period: "monthly" }, fullScan: { count: 0, period: "monthly" }, maxCronJobs: 1,
    tools: { hackSeo: { count: 2, period: "lifetime" }, devTools: { count: 3, period: "lifetime-per-tool" } },
    features: ["10 free website checks every month", "We look at up to 10 pages each time", "We click every link and tell you what's broken — in plain English", "Download your report (PDF & Markdown) to share or keep", "Try every extra tool free: 1 browser walk-through, 2 AI-text checks, 1 whole-site deep check", "Is your site ready for customers? 24-hour trial included", "Safety check: 2 free runs — are your doors locked?", "Google check: 2 free runs — can customers find you?", "Web tools (security, domain, redirects…): 3 free tries each", "1 scheduled job of your own (it hits a URL you pick — it does not re-scan your site)"],
  },
  {
    id: "basic", name: "Starter", tagline: "For small shops, side hustles and personal sites.",
    monthlyPriceUsd: 19, scansPerMonth: 60, maxPagesPerScan: 250, maxProjects: 5,
    auditTypes: ["generic", "technical-seo", "accessibility"], exports: true, monitoring: false, teamSeats: 1, whiteLabel: false,
    deepScans: { count: 3, period: "monthly" }, readiness: "trial", aiDetector: { count: 10, period: "monthly" }, flowScan: { count: 5, period: "monthly" }, fullScan: { count: 0, period: "monthly" }, maxCronJobs: 10,
    tools: { hackSeo: { count: 5, period: "monthly" }, devTools: { count: 20, period: "monthly-pooled" } },
    features: ["60 website checks every month", "We look at up to 250 pages each time — your whole small site", "Google & phone checks: will people find you and can they use you on mobile?", "See what changed since last time + keep your history", "5 browser walk-throughs/month · 10 AI-text checks/month · 3 whole-site deep checks/month", "Safety check — 5 runs/month: are your doors locked?", "Google check — 5 runs/month: can customers find you?", "Web tools — 20 runs/month", "Track up to 5 websites", "10 scheduled jobs of your own (URL pings — not site re-scans)"],
  },
  {
    id: "pro", name: "Pro", tagline: "For freelancers, consultants and growing businesses.",
    monthlyPriceUsd: 49, scansPerMonth: 300, maxPagesPerScan: 1000, maxProjects: 25,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 3, whiteLabel: false,
    deepScans: { count: 25, period: "monthly" }, readiness: "basic", aiDetector: { count: 50, period: "monthly" }, flowScan: { count: 25, period: "monthly" }, fullScan: { count: 10, period: "monthly" }, maxCronJobs: 50,
    tools: { hackSeo: { count: 30, period: "monthly" }, devTools: { count: 100, period: "monthly-pooled" } },
    features: ["300 website checks every month", "We look at up to 1,000 pages each time — your whole site", "Whole-site deep scan — 25/month: every page, every link (only your own verified sites)", "Is your site ready for customers? Full starter checks", "AI-text check — 50/month: does your site read like a real person wrote it?", "Browser walk-through — 25/month: we watch your site like a customer, live", "We also check: does your site turn visitors into buyers? + basic safety locks", "Safety & Google checks — 30 runs/month each", "Web tools — 100 runs/month", "Daily/weekly re-checks of saved sites + email when something new breaks", "Track 25 websites · invite 2 teammates · 50 scheduled jobs of your own"],
  },
  {
    id: "ultra-agency", name: "Agency", tagline: "For agencies juggling lots of client sites.",
    monthlyPriceUsd: 129, scansPerMonth: 1500, maxPagesPerScan: 2000, maxProjects: 200,
    auditTypes: ["generic", "technical-seo", "accessibility", "conversion-ux", "security-config"], exports: true, monitoring: true, teamSeats: 10, whiteLabel: true,
    deepScans: null, readiness: "full", aiDetector: null, flowScan: null, fullScan: null, maxCronJobs: 200,
    tools: { hackSeo: null, devTools: null },
    features: ["1,500 website checks every month", "We look at up to 2,000 pages each time — even huge client sites", "Whole-site deep scans — unlimited (your verified sites only)", "Is your site ready for customers? — our strictest checks", "AI-text check — unlimited: does it sound human?", "Browser walk-throughs — unlimited, live step-by-step", "Invite 10 teammates, put your logo on every report", "Safety, Google & Web tools — unlimited (website checks, pages, sites and seats still have the caps above)", "Daily/weekly re-checks of saved sites + email when something new breaks", "200 scheduled jobs of your own · priority help"],
  },
];

/** Live catalog overlay (admin-edited). Null means the code defaults. */
let overlayPlans: Plan[] | null = null;

export function setPlanOverlay(plans: Plan[] | null): void {
  overlayPlans = plans;
}

export function currentPlans(): Plan[] {
  return overlayPlans ?? PLANS;
}

export function getPlan(planId: string | null | undefined): Plan {
  return currentPlans().find((p) => p.id === planId) ?? PLANS[0];
}

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
    if (Number.isFinite(expiry) && expiry <= Date.now()) return getPlan("freemium");
  }
  return plan;
}

export function effectivePlanForOrg(org: {
  planId: string | null | undefined;
  planExpiresAt?: Date | string | null;
  adminPlanId?: string | null;
}): Plan {
  if (process.env.NODE_ENV !== "production" && process.env.CLYVRO_DEV_PLAN) {
    return getPlan(process.env.CLYVRO_DEV_PLAN);
  }
  if (org.adminPlanId) {
    const granted = currentPlans().find((p) => p.id === org.adminPlanId);
    if (granted) return granted;
  }
  return effectivePlan(org.planId, org.planExpiresAt);
}

export function allowanceText(allowance: RunAllowance, unit = "runs"): string {
  if (allowance === null) return "Unlimited";
  if (allowance.count === 0) return "Not included";
  return allowance.period === "lifetime"
    ? `${allowance.count} free ${unit} (lifetime)`
    : `${allowance.count} ${unit}/month`;
}

export const PLAN_RANK: Record<PlanId, number> = { freemium: 0, basic: 1, pro: 2, "ultra-agency": 3 };
export function planAtLeast(plan: Plan, minimum: PlanId): boolean {
  return PLAN_RANK[plan.id] >= PLAN_RANK[minimum];
}

export function planAllowsAuditTypes(plan: Plan, requested: AuditType[]): { ok: boolean; denied: AuditType[] } {
  const denied = requested.filter((t) => !plan.auditTypes.includes(t));
  return { ok: denied.length === 0, denied };
}
