import { NextResponse } from "next/server";
import { billingSummary } from "@/lib/services/billing";
import { premiumAccess, PREMIUM_TOOL_LABELS, type PremiumToolKey } from "@/lib/services/tool-access";
import { currentPlans } from "@/lib/plans";
import { currentPrices, detectCurrency, formatMoney, priceFor, type Currency } from "@/lib/billing";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const url = new URL(req.url);
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "3", 10);
    const summary = await billingSummary(ctx.organizationId, undefined, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 3,
    });
    const currency: Currency = detectCurrency(req.headers, {
      timezone: url.searchParams.get("tz") ?? undefined,
      locale: url.searchParams.get("locale") ?? undefined,
    });
    const plans = currentPlans().map((p) => {
      const price = priceFor(p.id, currency);
      return {
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        features: p.features,
        price: price ? { ...price, formatted: formatMoney(price.amount, price.currency) } : null,
        pricesConfigured: Boolean(currentPrices()[p.id]),
      };
    });
    const premiumKeys: PremiumToolKey[] = ["flow-scan", "ai-pattern", "deep-scan", "full-scan"];
    const premium = await Promise.all(premiumKeys.map(async (key) => {
      const a = await premiumAccess(ctx.organizationId, key);
      return {
        key, label: PREMIUM_TOOL_LABELS[key], allowed: a.allowed,
        used: a.used, limit: a.limit, remaining: a.remaining, period: a.period,
      };
    }));
    return NextResponse.json({ ...summary, currency, plans, role: ctx.role, premium });
  } catch (err) {
    return apiError(err);
  }
}
