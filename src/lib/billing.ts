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
 * available for every supported currency. Checkout charges NGN in Nigeria
 * and USD everywhere else — never USD on an NG merchant. The checkout
 * requests card so the merchant's enabled methods cannot introduce an
 * unsupported NGN method. Encryption key is unused (we never collect card
 * numbers). Until both keys are set, the billing page shows an honest
 * "not switched on yet" state and checkout refuses.
 */

import { chargeCountryFromSignals, type LocationHints } from "@/lib/billing-location";

/** Charge currencies. Historical rows may still hold GHS/GBP/EUR from earlier checkouts. */
export type Currency = "USD" | "NGN" | "GHS" | "KES" | "ZAR" | "GBP" | "EUR";
export type ChargeCurrency = "USD" | "NGN";

/** Monthly fixed amounts (whole currency units). Only NGN and USD are charged. */
export const PLAN_PRICES: Record<string, Partial<Record<Currency, number>>> = {
  basic: { USD: 19, NGN: 29000 },
  pro: { USD: 49, NGN: 75000 },
  "ultra-agency": { USD: 129, NGN: 195000 },
};

/** Nigeria → naira. Every other region (or unknown) → USD. Never USD on NG. */
export function currencyForCountry(country: string | null | undefined): ChargeCurrency {
  return country?.trim().toUpperCase() === "NG" ? "NGN" : "USD";
}

export function countryDisplayName(country: string | null | undefined): string | null {
  const code = country?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Copy shown on pricing/billing: detected region + the currency they will actually pay. */
export function payNotice(country: string | null | undefined, currency: Currency = currencyForCountry(country)): string {
  const name = countryDisplayName(country);
  if (currency === "NGN") {
    return name
      ? `Your region is ${name}. You'll pay in Nigerian naira (NGN).`
      : `You'll pay in Nigerian naira (NGN).`;
  }
  return name
    ? `Your region is ${name}. You'll pay in US dollars (USD).`
    : `We couldn't pin your country. You'll pay in US dollars (USD).`;
}

export function detectCurrency(
  headers: Headers | { get(name: string): string | null },
  hints: LocationHints = {},
): ChargeCurrency {
  return currencyForCountry(chargeCountryFromSignals(headers, hints).country);
}

/**
 * Money we charge for this connection: IP country, then IP timezone,
 * then device timezone, then locale. Cards from any country are accepted.
 * Nigeria is charged in NGN; every other region is charged in USD.
 */
export function chargeCurrency(
  headers: Headers | { get(name: string): string | null },
  hints: LocationHints = {},
): ChargeCurrency {
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

export const BILLING_CURRENCIES: ChargeCurrency[] = ["USD", "NGN"];

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
