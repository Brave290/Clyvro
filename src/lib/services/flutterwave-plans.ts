import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { flutterwaveApiBase, flutterwaveSecretKey } from "@/lib/billing";
import { ScanError } from "@/lib/scanner/types";

const CACHE_KEY = "billing.flw_payment_plans";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type PlanCache = Record<string, string>;

async function readCache(db: DB): Promise<PlanCache> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, CACHE_KEY)).limit(1);
  const value = row?.value;
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as PlanCache) } : {};
}

async function writeCache(db: DB, cache: PlanCache): Promise<void> {
  await db.insert(siteSettings)
    .values({ key: CACHE_KEY, value: cache, updatedBy: "billing", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: cache, updatedBy: "billing", updatedAt: new Date() },
    });
}

/**
 * Flutterwave Payment Plan for (plan, currency, amount). Created once and
 * reused so later months charge the same subscription. IDs live in
 * site_settings — never the client.
 */
export async function ensureFlutterwavePaymentPlan(
  input: { planId: string; planName: string; amount: number; currency: string },
  deps: { fetchImpl?: FetchLike } = {},
  db: DB,
): Promise<string> {
  const cacheKey = `${input.planId}:${input.currency}:${input.amount}`;
  const cache = await readCache(db);
  if (cache[cacheKey]) return cache[cacheKey];

  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(`${flutterwaveApiBase()}/payment-plans`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${flutterwaveSecretKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      name: `Clyvro ${input.planName} monthly ${input.currency}`,
      interval: "monthly",
      duration: 0,
      currency: input.currency,
    }),
  });
  const json = (await res.json().catch(() => null)) as { status?: string; data?: { id?: number | string } } | null;
  const id = json?.data?.id;
  if (!res.ok || json?.status !== "success" || id === undefined || id === null) {
    throw new ScanError(
      "NOT_IMPLEMENTED",
      "Auto-renew couldn't start with Flutterwave. Pay once for this month, or try again in a minute.",
    );
  }
  cache[cacheKey] = String(id);
  await writeCache(db, cache);
  return cache[cacheKey];
}

/** Cancel every active Flutterwave subscription for this email. Best-effort. */
export async function cancelFlutterwaveSubscriptions(
  email: string,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<number> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const list = await fetchImpl(
    `${flutterwaveApiBase()}/subscriptions?email=${encodeURIComponent(email)}`,
    { headers: { authorization: `Bearer ${flutterwaveSecretKey()}` } },
  );
  const json = (await list.json().catch(() => null)) as {
    status?: string;
    data?: { id?: number | string; status?: string }[] | { id?: number | string; status?: string };
  } | null;
  const rows = Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : [];
  let cancelled = 0;
  for (const row of rows) {
    if (!row?.id) continue;
    if (row.status && !/active|activated/i.test(row.status)) continue;
    const res = await fetchImpl(`${flutterwaveApiBase()}/subscriptions/${row.id}/cancel`, {
      method: "PUT",
      headers: { authorization: `Bearer ${flutterwaveSecretKey()}` },
    });
    if (res.ok) cancelled++;
  }
  return cancelled;
}
