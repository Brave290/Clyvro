import { NextResponse } from "next/server";
import { billingSummary } from "@/lib/services/billing";
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
    return NextResponse.json({ ...summary, currency, plans, role: ctx.role });
  } catch (err) {
    return apiError(err);
  }
}
