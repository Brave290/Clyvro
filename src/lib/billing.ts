/**
 * Billing configuration: fixed per-currency monthly prices and region
 * detection. Amounts are ALWAYS computed on the server from this table —
 * the browser never supplies a price. Prices are whole units of each
 * currency (Flutterwave expects e.g. 29000 for ₦29,000).
 *
 * Founder env (Vercel): FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_PUBLIC_KEY
 * (unused by server checkout but kept for parity), FLUTTERWAVE_WEBHOOK_SECRET
 * (the "secret hash" from the Flutterwave dashboard), optional
 * FLUTTERWAVE_API_BASE (defaults to the v3 API). Until the secret key is
 * set, the billing page shows an honest "not switched on yet" state and
 * checkout refuses — no fake payments, ever.
 */

export type Currency = "USD" | "NGN" | "GHS" | "KES" | "ZAR" | "GBP" | "EUR";

/** Monthly fixed amounts (whole currency units). */
export const PLAN_PRICES: Record<string, Partial<Record<Currency, number>>> = {
  basic: { USD: 19, NGN: 29000, GHS: 290, KES: 2500, ZAR: 349, GBP: 15, EUR: 17 },
  pro: { USD: 49, NGN: 75000, GHS: 750, KES: 6500, ZAR: 899, GBP: 39, EUR: 45 },
  "ultra-agency": { USD: 129, NGN: 195000, GHS: 1950, KES: 16900, ZAR: 2299, GBP: 99, EUR: 119 },
};

const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", GB: "GBP",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", IE: "EUR", BE: "EUR", PT: "EUR", AT: "EUR",
};

/** Region hint from edge headers (Vercel, then Cloudflare), else USD. */
export function currencyForCountry(country: string | null | undefined): Currency {
  if (!country) return "USD";
  return COUNTRY_TO_CURRENCY[country.trim().toUpperCase()] ?? "USD";
}

export function detectCurrency(headers: Headers | { get(name: string): string | null }): Currency {
  return currencyForCountry(headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry"));
}

export function priceFor(planId: string, currency: Currency): { amount: number; currency: Currency } | null {
  const table = PLAN_PRICES[planId];
  if (!table) return null;
  if (table[currency]) return { amount: table[currency]!, currency };
  if (table.USD) return { amount: table.USD, currency: "USD" };
  return null;
}

export function formatMoney(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function billingConfigured(): boolean {
  return Boolean(process.env.FLUTTERWAVE_SECRET_KEY);
}

export function flutterwaveApiBase(): string {
  return (process.env.FLUTTERWAVE_API_BASE ?? "https://api.flutterwave.com/v3").replace(/\/+$/, "");
}
