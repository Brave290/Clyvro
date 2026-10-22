import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { PLANS, setPlanOverlay, type Plan, type PlanId } from "@/lib/plans";
import {
  BILLING_CURRENCIES, PLAN_PRICES, setPriceOverlay, type Currency,
} from "@/lib/billing";
import { logAdmin, type AdminActor } from "@/lib/services/admin";
import { ScanError } from "@/lib/scanner/types";

/**
 * Admin-editable billing catalog.
 *
 * Defaults live in code (PLANS / PLAN_PRICES). Overrides are a single
 * site_settings row (`billing.catalog`). hydratePlanCatalog merges them
 * onto the process overlay so getPlan / priceFor / the billing page all
 * see the same live numbers — nothing is static once an admin saves.
 */

export const CATALOG_KEY = "billing.catalog";
const CACHE_MS = 15_000;

export interface PlanOverride {
  name?: string;
  tagline?: string;
  features?: string[];
  monthlyPriceUsd?: number;
  scansPerMonth?: number;
  maxPagesPerScan?: number;
  maxProjects?: number;
  teamSeats?: number;
  maxCronJobs?: number;
  prices?: Partial<Record<Currency, number>>;
}

export type CatalogPayload = Partial<Record<PlanId, PlanOverride>>;

interface Cache { at: number; catalog: CatalogPayload }
let cache: Cache | null = null;

function asInt(v: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function asText(v: unknown, fallback: string, max = 200): string {
  if (typeof v !== "string") return fallback;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : fallback;
}

function asFeatures(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const rows = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 20);
  return rows.length ? rows.map((r) => r.slice(0, 200)) : fallback;
}

function asPrices(v: unknown, fallback: Partial<Record<Currency, number>>): Partial<Record<Currency, number>> {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Partial<Record<Currency, number>> = { ...fallback };
  for (const c of BILLING_CURRENCIES) {
    if (src[c] === undefined || src[c] === null || src[c] === "") continue;
    const n = asInt(src[c], fallback[c] ?? 0, 0, 50_000_000);
    out[c] = n;
  }
  return out;
}

export function defaultCatalog(): CatalogPayload {
  const out: CatalogPayload = {};
  for (const p of PLANS) {
    out[p.id] = {
      name: p.name, tagline: p.tagline, features: [...p.features],
      monthlyPriceUsd: p.monthlyPriceUsd,
      scansPerMonth: p.scansPerMonth, maxPagesPerScan: p.maxPagesPerScan,
      maxProjects: p.maxProjects, teamSeats: p.teamSeats, maxCronJobs: p.maxCronJobs,
      prices: { ...(PLAN_PRICES[p.id] ?? {}) },
    };
  }
  return out;
}

export function sanitizeCatalog(raw: unknown): CatalogPayload {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaults = defaultCatalog();
  const out: CatalogPayload = {};
  for (const p of PLANS) {
    const d = defaults[p.id]!;
    const patch = (input[p.id] && typeof input[p.id] === "object" ? input[p.id] : {}) as PlanOverride;
    out[p.id] = {
      name: asText(patch.name, d.name!, 40),
      tagline: asText(patch.tagline, d.tagline!, 160),
      features: asFeatures(patch.features, d.features!),
      monthlyPriceUsd: asInt(patch.monthlyPriceUsd, d.monthlyPriceUsd!, 0, 10_000),
      scansPerMonth: asInt(patch.scansPerMonth, d.scansPerMonth!, 0, 100_000),
      maxPagesPerScan: asInt(patch.maxPagesPerScan, d.maxPagesPerScan!, 1, 20_000),
      maxProjects: asInt(patch.maxProjects, d.maxProjects!, 1, 10_000),
      teamSeats: asInt(patch.teamSeats, d.teamSeats!, 1, 500),
      maxCronJobs: asInt(patch.maxCronJobs, d.maxCronJobs!, 0, 10_000),
      prices: p.id === "freemium" ? {} : asPrices(patch.prices, d.prices ?? {}),
    };
  }
  return out;
}

function applyCatalog(catalog: CatalogPayload): void {
  const plans: Plan[] = PLANS.map((base) => {
    const o = catalog[base.id];
    if (!o) return base;
    return {
      ...base,
      name: o.name ?? base.name,
      tagline: o.tagline ?? base.tagline,
      features: o.features ?? base.features,
      monthlyPriceUsd: o.monthlyPriceUsd ?? base.monthlyPriceUsd,
      scansPerMonth: o.scansPerMonth ?? base.scansPerMonth,
      maxPagesPerScan: o.maxPagesPerScan ?? base.maxPagesPerScan,
      maxProjects: o.maxProjects ?? base.maxProjects,
      teamSeats: o.teamSeats ?? base.teamSeats,
      maxCronJobs: o.maxCronJobs ?? base.maxCronJobs,
    };
  });
  const prices: Record<string, Partial<Record<Currency, number>>> = {};
  for (const p of PLANS) {
    prices[p.id] = { ...(PLAN_PRICES[p.id] ?? {}), ...(catalog[p.id]?.prices ?? {}) };
  }
  setPlanOverlay(plans);
  setPriceOverlay(prices);
}

export async function hydratePlanCatalog(db: DB): Promise<CatalogPayload> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    applyCatalog(cache.catalog);
    return cache.catalog;
  }
  try {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, CATALOG_KEY)).limit(1);
    const catalog = sanitizeCatalog(row?.value ?? {});
    cache = { at: Date.now(), catalog };
    applyCatalog(catalog);
    return catalog;
  } catch {
    applyCatalog(defaultCatalog());
    return defaultCatalog();
  }
}

export function peekCatalogCache(): CatalogPayload {
  return cache?.catalog ?? defaultCatalog();
}

export async function savePlanCatalog(actor: AdminActor, raw: unknown, db: DB): Promise<CatalogPayload> {
  const catalog = sanitizeCatalog(raw);
  const paid = (["basic", "pro", "ultra-agency"] as PlanId[]).every((id) => {
    const usd = catalog[id]?.prices?.USD;
    return typeof usd === "number" && usd > 0;
  });
  if (!paid) throw new ScanError("VALIDATION", "Paid plans need a USD price greater than zero.");
  await db.insert(siteSettings)
    .values({ key: CATALOG_KEY, value: catalog, updatedBy: actor.email, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: catalog, updatedBy: actor.email, updatedAt: new Date() },
    });
  cache = { at: Date.now(), catalog };
  applyCatalog(catalog);
  await logAdmin(db, actor, "billing.catalog_saved", "site", CATALOG_KEY, { plans: Object.keys(catalog) });
  return catalog;
}

/** Put checkout amounts back to the code defaults. Names, taglines and features stay. */
export function catalogWithDefaultPrices(current: CatalogPayload): CatalogPayload {
  const defaults = defaultCatalog();
  const out: CatalogPayload = {};
  for (const p of PLANS) {
    const live = current[p.id] ?? defaults[p.id]!;
    out[p.id] = {
      ...live,
      monthlyPriceUsd: defaults[p.id]!.monthlyPriceUsd,
      prices: p.id === "freemium" ? {} : { ...(defaults[p.id]!.prices ?? {}) },
    };
  }
  return out;
}

export async function restorePlanPrices(actor: AdminActor, db: DB): Promise<CatalogPayload> {
  const current = await hydratePlanCatalog(db);
  const catalog = sanitizeCatalog(catalogWithDefaultPrices(current));
  await db.insert(siteSettings)
    .values({ key: CATALOG_KEY, value: catalog, updatedBy: actor.email, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: catalog, updatedBy: actor.email, updatedAt: new Date() },
    });
  cache = { at: Date.now(), catalog };
  applyCatalog(catalog);
  await logAdmin(db, actor, "billing.prices_restored", "site", CATALOG_KEY, { plans: Object.keys(catalog) });
  return catalog;
}
