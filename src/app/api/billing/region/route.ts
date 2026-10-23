import { NextResponse } from "next/server";
import { chargeCurrency, countryDisplayName, formatMoney, payNotice, priceFor, type Currency } from "@/lib/billing";
import { detectCountryFromSignals } from "@/lib/billing-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_PLAN_IDS = ["basic", "pro", "ultra-agency"] as const;

/**
 * Public: charge currency for this connection (IP → IP tz → device tz → locale).
 * Same table checkout uses. No auth, no country picker, no VPN check.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hints = {
    timezone: url.searchParams.get("tz") ?? undefined,
    locale: url.searchParams.get("locale") ?? undefined,
  };
  const currency = chargeCurrency(req.headers, hints);
  const guess = detectCountryFromSignals(req.headers, hints);
  const plans: Record<string, { amount: number; currency: Currency; formatted: string }> = {};
  for (const id of PAID_PLAN_IDS) {
    const price = priceFor(id, currency);
    if (price) plans[id] = { ...price, formatted: formatMoney(price.amount, price.currency) };
  }
  return NextResponse.json(
    {
      currency,
      country: guess.country,
      countryName: countryDisplayName(guess.country),
      source: guess.source,
      notice: payNotice(guess.country, currency),
      plans,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
