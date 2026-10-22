import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { organizations, usageEvents } from "@/lib/db/schema";
import { effectivePlanForOrg, type Plan } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";

/**
 * Central run allowances for the gated tools (Hack Protection, SEO
 * Visibility, and the five Developer Tools).
 *
 * The model the founder approved: everyone can try every tool and see
 * FULL results a few times; Ultra Agency makes extra tools unlimited
 * (website checks, pages, sites and seats still have published caps).
 *  - Hack/SEO: per-tool counter — lifetime on Freemium, monthly on paid.
 *  - Dev Tools: lifetime per-tool on Freemium; one pooled monthly
 *    counter across all five on paid tiers.
 * Enforcement is server-side only (usage_events, kind `tool:*`); the UI
 * reads the same numbers for remaining-run labels and lock states, so
 * what users see is exactly what the API enforces.
 */

export type ToolKey =
  | "hack-protection" | "seo-visibility"
  | "ssl" | "dns" | "redirects" | "headers" | "robots";

export const HACK_SEO_TOOLS: ToolKey[] = ["hack-protection", "seo-visibility"];
export const DEV_TOOLS: ToolKey[] = ["ssl", "dns", "redirects", "headers", "robots"];
export const ALL_TOOLS: ToolKey[] = [...HACK_SEO_TOOLS, ...DEV_TOOLS];

export const TOOL_LABELS: Record<ToolKey, string> = {
  "hack-protection": "Hack Protection",
  "seo-visibility": "SEO Visibility",
  ssl: "SSL Monitor",
  dns: "DNS Inspector",
  redirects: "Redirect Tracer",
  headers: "Headers Debugger",
  robots: "Robots & Sitemap Tester",
};

const kindOf = (tool: ToolKey) => `tool:${tool}`;
const DEV_KINDS = DEV_TOOLS.map(kindOf);

export interface ToolAccess {
  tool: ToolKey;
  label: string;
  allowed: boolean;
  used: number;
  /** null = unlimited (Ultra Agency). */
  limit: number | null;
  period: "lifetime" | "monthly" | "unlimited";
  remaining: number | null;
  planName: string;
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function planForOrg(organizationId: string, db: DB): Promise<Plan> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  return effectivePlanForOrg(org);
}

async function countUsed(db: DB, organizationId: string, kinds: string[], monthly: boolean): Promise<number> {
  const where = monthly
    ? and(eq(usageEvents.organizationId, organizationId), inArray(usageEvents.kind, kinds), gte(usageEvents.createdAt, monthStartUtc()))
    : and(eq(usageEvents.organizationId, organizationId), inArray(usageEvents.kind, kinds));
  const [row] = await db.select({ value: count() }).from(usageEvents).where(where);
  return row?.value ?? 0;
}

export async function toolAccess(organizationId: string, tool: ToolKey, dbOverride?: DB): Promise<ToolAccess> {
  const db = dbOverride ?? (await getDb());
  const plan = await planForOrg(organizationId, db);
  const base = { tool, label: TOOL_LABELS[tool], planName: plan.name };
  if (HACK_SEO_TOOLS.includes(tool)) {
    const rule = plan.tools.hackSeo;
    if (!rule) return { ...base, allowed: true, used: 0, limit: null, period: "unlimited", remaining: null };
    const used = await countUsed(db, organizationId, [kindOf(tool)], rule.period === "monthly");
    return {
      ...base, allowed: used < rule.count, used, limit: rule.count,
      period: rule.period, remaining: Math.max(0, rule.count - used),
    };
  }
  const rule = plan.tools.devTools;
  if (!rule) return { ...base, allowed: true, used: 0, limit: null, period: "unlimited", remaining: null };
  if (rule.period === "lifetime-per-tool") {
    const used = await countUsed(db, organizationId, [kindOf(tool)], false);
    return { ...base, allowed: used < rule.count, used, limit: rule.count, period: "lifetime", remaining: Math.max(0, rule.count - used) };
  }
  const used = await countUsed(db, organizationId, DEV_KINDS, true);
  return { ...base, allowed: used < rule.count, used, limit: rule.count, period: "monthly", remaining: Math.max(0, rule.count - used) };
}

export async function toolAccessSummary(organizationId: string, dbOverride?: DB): Promise<ToolAccess[]> {
  const db = dbOverride ?? (await getDb());
  return Promise.all(ALL_TOOLS.map((tool) => toolAccess(organizationId, tool, db)));
}

/**
 * Consume one run. Throws PLAN_LIMIT (server-enforced) when the
 * allowance is gone; the message is the friendly upgrade copy the UI
 * shows verbatim.
 */
export async function consumeToolRun(organizationId: string, tool: ToolKey, dbOverride?: DB): Promise<ToolAccess> {
  const db = dbOverride ?? (await getDb());
  const access = await toolAccess(organizationId, tool, db);
  if (!access.allowed) {
    throw new ScanError(
      "PLAN_LIMIT",
      access.period === "lifetime"
        ? `You've used your ${access.limit} free ${access.label} runs on the ${access.planName} plan. They were full, real runs — upgrading removes the cap (Ultra Agency makes extra tools unlimited; website checks, pages, sites and seats still have caps). See Pricing for what each plan unlocks.`
        : `You've reached this month's ${access.label} allowance on the ${access.planName} plan (${access.limit}/month). It resets on the 1st, or upgrade now — Ultra Agency makes extra tools unlimited (website checks, pages, sites and seats still have caps).`,
    );
  }
  await db.insert(usageEvents).values({
    id: newId(), organizationId, auditId: newId(), kind: kindOf(tool),
  });
  return toolAccess(organizationId, tool, db);
}

/* ------------------------------------------------------------------ */
/* Premium tools (Flow Scan, AI-Pattern, deep scans): open to every    */
/* plan with per-plan run allowances; Ultra is unlimited.              */
/* ------------------------------------------------------------------ */

export type PremiumToolKey = "flow-scan" | "ai-pattern" | "deep-scan" | "full-scan";

export const PREMIUM_TOOL_LABELS: Record<PremiumToolKey, string> = {
  "flow-scan": "Flow Scan",
  "ai-pattern": "AI-Pattern detector",
  "deep-scan": "Deep scans",
  "full-scan": "Full Scan",
};

const premiumKindOf = (tool: PremiumToolKey) => `premium:${tool}`;

export interface PremiumAccess {
  tool: PremiumToolKey;
  label: string;
  allowed: boolean;
  used: number;
  /** null = unlimited (Ultra Agency). */
  limit: number | null;
  period: "lifetime" | "monthly" | "unlimited";
  remaining: number | null;
  planName: string;
}

function allowanceFor(plan: Plan, tool: PremiumToolKey) {
  return tool === "flow-scan" ? plan.flowScan
    : tool === "ai-pattern" ? plan.aiDetector
    : tool === "full-scan" ? plan.fullScan
    : plan.deepScans;
}

export async function premiumAccess(organizationId: string, tool: PremiumToolKey, dbOverride?: DB): Promise<PremiumAccess> {
  const db = dbOverride ?? (await getDb());
  const plan = await planForOrg(organizationId, db);
  const rule = allowanceFor(plan, tool);
  const base = { tool, label: PREMIUM_TOOL_LABELS[tool], planName: plan.name };
  if (!rule) return { ...base, allowed: true, used: 0, limit: null, period: "unlimited", remaining: null };
  const used = await countUsed(db, organizationId, [premiumKindOf(tool)], rule.period === "monthly");
  return {
    ...base, allowed: used < rule.count, used, limit: rule.count,
    period: rule.period, remaining: Math.max(0, rule.count - used),
  };
}

/** Consume one premium run. Throws PLAN_LIMIT when the allowance is gone. */
export async function consumePremiumRun(organizationId: string, tool: PremiumToolKey, dbOverride?: DB): Promise<PremiumAccess> {
  const db = dbOverride ?? (await getDb());
  const access = await premiumAccess(organizationId, tool, db);
  if (!access.allowed) {
    throw new ScanError(
      "PLAN_LIMIT",
      access.period === "lifetime"
        ? `You've used your ${access.limit} free ${access.label} runs on the ${access.planName} plan. They were full, real runs — every plan can test every tool, and upgrading raises the cap (Ultra Agency makes extra tools unlimited; website checks, pages, sites and seats still have caps). See Pricing.`
        : `You've reached this month's ${access.label} allowance on the ${access.planName} plan (${access.limit}/month). It resets on the 1st — or upgrade now; Ultra Agency makes extra tools unlimited (website checks, pages, sites and seats still have caps).`,
    );
  }
  if (access.limit !== null) {
    await db.insert(usageEvents).values({
      id: newId(), organizationId, auditId: newId(), kind: premiumKindOf(tool),
    });
  }
  return premiumAccess(organizationId, tool, db);
}

/** Give a consumed run back (e.g. the tool never actually started — don't charge for our outage). */
export async function refundPremiumRun(organizationId: string, tool: PremiumToolKey, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const [latest] = await db.select({ id: usageEvents.id }).from(usageEvents)
    .where(and(eq(usageEvents.organizationId, organizationId), eq(usageEvents.kind, premiumKindOf(tool))))
    .orderBy(desc(usageEvents.createdAt)).limit(1);
  if (latest) await db.delete(usageEvents).where(eq(usageEvents.id, latest.id));
}
