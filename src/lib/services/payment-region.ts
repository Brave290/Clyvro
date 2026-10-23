import {
  cleanCountry,
  detectCountryFromSignals,
  type LocationGuess,
  type LocationHints,
  type LocationSource,
} from "@/lib/billing-location";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Payment region (checkout-time). No country picker. No VPN/proxy block.
 *
 * Country is computed from IP (optional intel, then Vercel / Cloudflare
 * geo headers), then IP timezone, then the device timezone/locale hints.
 * Flutterwave accepts cards from any country; we only change charge currency.
 */

export interface RegionVerdict {
  decision: "allow";
  /** Resolved billing country (ISO 3166-1 alpha-2), or null if unknown. */
  country: string | null;
  ipCountry: string | null;
  source: "intel" | LocationSource;
}

/** Client IP from proxy headers (first hop). Null for private/loopback/absent. */
export function clientIp(headers: Headers): string | null {
  const raw =
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0] ??
    null;
  const ip = raw?.trim();
  if (!ip) return null;
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:)/i.test(ip)) return null;
  return ip.slice(0, 64);
}

async function intelCountry(ip: string, fetchImpl: FetchLike): Promise<string | null> {
  const template = process.env.PAYMENT_IP_INTEL_URL?.trim();
  if (!template) return null;
  try {
    const url = template.replace("{ip}", encodeURIComponent(ip));
    const key = process.env.PAYMENT_IP_INTEL_KEY?.trim();
    const res = await fetchImpl(url, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j) return null;
    return cleanCountry(
      (typeof j.country_code === "string" && j.country_code) ||
      (typeof j.countryCode === "string" && j.countryCode) ||
      null,
    );
  } catch {
    return null;
  }
}

export async function verifyPaymentRegion(
  headers: Headers,
  hints: LocationHints = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<RegionVerdict> {
  const ip = clientIp(headers);
  const intel = ip ? await intelCountry(ip, deps.fetchImpl ?? fetch) : null;
  const signals: LocationGuess = detectCountryFromSignals(headers, hints);
  const platform = cleanCountry(headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry"));
  const ipCountry = intel ?? platform;
  const country = intel ?? signals.country;
  const source: RegionVerdict["source"] = intel ? "intel" : signals.source;
  return { decision: "allow", country, ipCountry, source };
}
