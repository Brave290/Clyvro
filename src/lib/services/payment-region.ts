import {
  cleanCountry,
  detectCountryFromSignals,
  type LocationGuess,
  type LocationHints,
  type LocationSource,
} from "@/lib/billing-location";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Payment region (checkout-time).
 *
 *  1. VPN/proxy discard — when an IP-intelligence source is configured
 *     (PAYMENT_IP_INTEL_URL, `{ip}` placeholder, optional
 *     PAYMENT_IP_INTEL_KEY bearer), connections it flags as VPN,
 *     proxy or Tor are refused. Without a configured source there is
 *     no honest way to detect a VPN from an IP alone, so the check
 *     reports `vpnDetected: null` and does not pretend otherwise.
 *  2. Location — country is computed from IP (intel, then Vercel /
 *     Cloudflare geo headers), then IP timezone, then the device
 *     timezone/locale hints. The customer never picks a country.
 *
 * Verdicts are explicit so callers/tests can assert why a checkout
 * was refused or which signal set the currency.
 */

export interface RegionVerdict {
  decision: "allow" | "block";
  /** Plain-language refusal reason (present when decision is "block"). */
  reason?: string;
  /** Resolved billing country (ISO 3166-1 alpha-2), or null if unknown. */
  country: string | null;
  ipCountry: string | null;
  vpnDetected: boolean | null;
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

interface IntelResult { country: string | null; vpn: boolean | null }

async function intelLookup(ip: string, fetchImpl: FetchLike): Promise<IntelResult | null> {
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
    const country = cleanCountry(
      (typeof j.country_code === "string" && j.country_code) ||
      (typeof j.countryCode === "string" && j.countryCode) ||
      null,
    );
    const privacy = (typeof j.privacy === "object" && j.privacy !== null ? j.privacy : {}) as Record<string, unknown>;
    const flag = (...vals: unknown[]) => vals.some((v) => v === true);
    const vpn = flag(j.proxy, j.vpn, j.tor, privacy.vpn, privacy.proxy, privacy.tor);
    const anyFlagPresent = [j.proxy, j.vpn, j.tor, privacy.vpn, privacy.proxy, privacy.tor]
      .some((v) => typeof v === "boolean");
    return { country, vpn: anyFlagPresent ? vpn : null };
  } catch {
    return null; // intel is an enhancement; outages never block honest buyers silently — platform header still applies
  }
}

export async function verifyPaymentRegion(
  headers: Headers,
  hints: LocationHints = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<RegionVerdict> {
  const ip = clientIp(headers);
  const intel = ip ? await intelLookup(ip, deps.fetchImpl ?? fetch) : null;
  const signals: LocationGuess = detectCountryFromSignals(headers, hints);
  const platform = cleanCountry(headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry"));
  const ipCountry = intel?.country ?? platform;
  const country = intel?.country ?? signals.country;
  const source: RegionVerdict["source"] = intel?.country ? "intel" : signals.source;
  const base = { country, ipCountry, vpnDetected: intel?.vpn ?? null, source };

  if (intel?.vpn === true) {
    return {
      ...base, decision: "block",
      reason: "This connection appears to be using a VPN or proxy, and checkouts can't run over one. Please switch it off and try again — this protects cardholders from region-spoofed fraud.",
    };
  }
  return { ...base, decision: "allow" };
}
