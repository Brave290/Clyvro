/**
 * Billing configuration: fixed per-currency monthly prices and region
 * detection. Amounts are ALWAYS computed on the server from this table —
 * the browser never supplies a price. Prices are whole units of each
 * currency (Flutterwave expects e.g. 29000 for ₦29,000).
 *
 * Founder env (Vercel): FLUTTERWAVE_SECRET_KEY (server verify only),
 * FLUTTERWAVE_PUBLIC_KEY (in-app FlutterwaveCheckout modal),
 * FLUTTERWAVE_WEBHOOK_SECRET (the "secret hash" from the Flutterwave
 * dashboard), optional FLUTTERWAVE_API_BASE (defaults to the v3 API).
 * Checkout returns an Inline payload (public key + tx_ref + amount).
 * The browser opens Flutterwave's payment form on this page. Cards are
 * available for every supported currency. The checkout requests card so the
 * merchant's enabled methods cannot introduce an unsupported NGN method.
 * Encryption key is unused (we never
 * collect card numbers). Until both keys are set, the billing page
 * shows an honest "not switched on yet" state and checkout refuses.
 */

import { chargeCountryFromSignals, type LocationHints } from "@/lib/billing-location";

export type Currency = "USD" | "NGN" | "GHS" | "KES" | "ZAR" | "GBP" | "EUR";

/** Monthly fixed amounts (whole currency units). */
export const PLAN_PRICES: Record<string, Partial<Record<Currency, number>>> = {
  basic: { USD: 19, NGN: 29000, GHS: 290, KES: 2500, ZAR: 349, GBP: 15, EUR: 17 },
  pro: { USD: 49, NGN: 75000, GHS: 750, KES: 6500, ZAR: 899, GBP: 39, EUR: 45 },
  "ultra-agency": { USD: 129, NGN: 195000, GHS: 1950, KES: 16900, ZAR: 2299, GBP: 99, EUR: 119 },
};

const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  US: "USD", NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", GB: "GBP",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", IE: "EUR", BE: "EUR", PT: "EUR", AT: "EUR",
  FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", CY: "EUR", MT: "EUR", HR: "EUR",
};

/** Region hint from edge headers (Vercel, then Cloudflare), else USD. */
export function currencyForCountry(country: string | null | undefined): Currency {
  if (!country) return "USD";
  return COUNTRY_TO_CURRENCY[country.trim().toUpperCase()] ?? "USD";
}

export function detectCurrency(
  headers: Headers | { get(name: string): string | null },
  hints: LocationHints = {},
): Currency {
  return currencyForCountry(chargeCountryFromSignals(headers, hints).country);
}

/**
 * Money we charge for this connection: IP country, then IP timezone,
 * then device timezone, then locale. Cards from any country are accepted;
 * only the charge currency changes (NG NGN, GB GBP, GH GHS, eurozone EUR, else USD).
 */
export function chargeCurrency(
  headers: Headers | { get(name: string): string | null },
  hints: LocationHints = {},
): Currency {
  return detectCurrency(headers, hints);
}

export function flutterwaveSecretKey(): string {
  return (process.env.FLUTTERWAVE_SECRET_KEY ?? "").trim();
}

export function flutterwavePublicKey(): string {
  return (process.env.FLUTTERWAVE_PUBLIC_KEY ?? "").trim();
}

/** Optional split-payment destination returned by Flutterwave when a subaccount is created. */
export function flutterwaveSubaccountId(): string | null {
  const value = (process.env.FLUTTERWAVE_SUBACCOUNT_ID ?? "").trim();
  return value || null;
}

export const BILLING_CURRENCIES: Currency[] = ["USD", "NGN", "GHS", "KES", "ZAR", "GBP", "EUR"];

type PriceTable = Record<string, Partial<Record<Currency, number>>>;
let overlayPrices: PriceTable | null = null;

export function setPriceOverlay(prices: PriceTable | null): void {
  overlayPrices = prices;
}

export function currentPrices(): PriceTable {
  return overlayPrices ?? PLAN_PRICES;
}

export function priceFor(planId: string, currency: Currency): { amount: number; currency: Currency } | null {
  const table = currentPrices()[planId] ?? PLAN_PRICES[planId];
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
  return Boolean(flutterwaveSecretKey() && flutterwavePublicKey());
}

export function flutterwaveApiBase(): string {
  return (process.env.FLUTTERWAVE_API_BASE ?? "https://api.flutterwave.com/v3").replace(/\/+$/, "");
}
