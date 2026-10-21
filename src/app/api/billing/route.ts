import { NextResponse } from "next/server";
import { billingSummary } from "@/lib/services/billing";
import { premiumAccess, PREMIUM_TOOL_LABELS, type PremiumToolKey } from "@/lib/services/tool-access";
import { PLANS } from "@/lib/plans";
import { PLAN_PRICES, detectCurrency, formatMoney, priceFor, type Currency } from "@/lib/billing";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const summary = await billingSummary(ctx.organizationId);
    const currency: Currency = detectCurrency(req.headers);
    const plans = PLANS.map((p) => {
      const price = priceFor(p.id, currency);
      return {
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        features: p.features,
        price: price ? { ...price, formatted: formatMoney(price.amount, price.currency) } : null,
        pricesConfigured: Boolean(PLAN_PRICES[p.id]),
      };
    });
    const premiumKeys: PremiumToolKey[] = ["flow-scan", "ai-pattern", "deep-scan"];
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
