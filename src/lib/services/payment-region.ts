type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Payment region verification (checkout-time).
 *
 * Two checks, run before a checkout link is created:
 *  1. VPN/proxy discard — when an IP-intelligence source is configured
 *     (PAYMENT_IP_INTEL_URL, `{ip}` placeholder, optional
 *     PAYMENT_IP_INTEL_KEY bearer), connections it flags as VPN,
 *     proxy or Tor are refused. Without a configured source there is
 *     no honest way to detect a VPN from an IP alone, so the check
 *     reports `vpnDetected: null` and does not pretend otherwise.
 *  2. Address-region match — the billing country the customer
 *     declares at checkout must match the country of their connection
 *     (intel lookup first; otherwise the platform geo header —
 *     `x-vercel-ip-country` / `cf-ipcountry`, which the platform sets
 *     and clients can't spoof on Vercel). A mismatch is refused with
 *     a plain-language reason; when NO country signal exists at all
 *     the checkout proceeds but the verdict records `source: "none"`
 *     — we never fabricate a country.
 *
 * Verdicts are intentionally explicit so callers/tests can assert
 * exactly why a checkout was refused.
 */

export interface RegionVerdict {
  decision: "allow" | "block";
  /** Plain-language refusal reason (present when decision is "block"). */
  reason?: string;
  ipCountry: string | null;
  declaredCountry: string | null;
  /** true/false when an intel source answered; null when unknown. */
  vpnDetected: boolean | null;
  source: "intel" | "platform" | "none";
}

const cleanCountry = (v: string | null | undefined): string | null => {
  const c = (v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
};

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

function platformCountry(headers: Headers): string | null {
  return cleanCountry(headers.get("x-vercel-ip-country")) ?? cleanCountry(headers.get("cf-ipcountry"));
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
    // Common provider shapes: ip-api (proxy/hosting booleans),
    // ipapi.co-style (vpn), nested privacy objects.
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
  declaredCountryRaw: string | null | undefined,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<RegionVerdict> {
  const declaredCountry = cleanCountry(declaredCountryRaw);
  const ip = clientIp(headers);
  const intel = ip ? await intelLookup(ip, deps.fetchImpl ?? fetch) : null;
  const ipCountry = intel?.country ?? platformCountry(headers);
  const source: RegionVerdict["source"] = intel ? "intel" : ipCountry ? "platform" : "none";
  const base = { ipCountry, declaredCountry, vpnDetected: intel?.vpn ?? null, source };

  if (intel?.vpn === true) {
    return {
      ...base, decision: "block",
      reason: "This connection appears to be using a VPN or proxy, and checkouts can't run over one. Please switch it off and try again — this protects cardholders from region-spoofed fraud.",
    };
  }
  if (declaredCountry && ipCountry && declaredCountry !== ipCountry) {
    return {
      ...base, decision: "block",
      reason: `Your billing country (${declaredCountry}) doesn't match the region of this connection (${ipCountry}). Please check out from your billing country, or update the billing country if you've moved.`,
    };
  }
  return { ...base, decision: "allow" };
}
