/**
 * Where we think the customer is — used only to pick a charge currency.
 * The browser never supplies a country code or a price.
 *
 * Trust order (first hit wins):
 *  1. Platform IP country (`x-vercel-ip-country` / `cf-ipcountry`) — the
 *     edge sets these; the client cannot spoof them on Vercel.
 *  2. IP-derived timezone (`x-vercel-ip-timezone`) mapped to a country.
 *  3. Device timezone (IANA), sent as a hint.
 *  4. Locale / Accept-Language region subtag (`en-NG` → NG).
 *
 * Unknown country → USD. Nigeria → NGN. No country picker. No VPN check.
 */

export type LocationSource = "platform" | "ip-timezone" | "timezone" | "locale" | "none";

export interface LocationHints {
  /** IANA timezone, e.g. Africa/Lagos. */
  timezone?: string;
  /** BCP-47 locale, e.g. en-NG. */
  locale?: string;
}

export interface LocationGuess {
  country: string | null;
  source: LocationSource;
}

const ISO2 = /^[A-Z]{2}$/;

export function cleanCountry(v: string | null | undefined): string | null {
  const c = (v ?? "").trim().toUpperCase();
  return ISO2.test(c) ? c : null;
}

/**
 * IANA timezone → ISO 3166-1 alpha-2. Only unique / primary mappings —
 * never a continent-wide guess (America/* is not always US).
 */
export const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "Africa/Lagos": "NG",
  "Africa/Porto-Novo": "BJ",
  "Africa/Accra": "GH",
  "Africa/Abidjan": "CI",
  "Africa/Dakar": "SN",
  "Africa/Lome": "TG",
  "Africa/Ouagadougou": "BF",
  "Africa/Niamey": "NE",
  "Africa/Bamako": "ML",
  "Africa/Conakry": "GN",
  "Africa/Freetown": "SL",
  "Africa/Monrovia": "LR",
  "Africa/Nairobi": "KE",
  "Africa/Kampala": "UG",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Addis_Ababa": "ET",
  "Africa/Kigali": "RW",
  "Africa/Mogadishu": "SO",
  "Africa/Khartoum": "SD",
  "Africa/Johannesburg": "ZA",
  "Africa/Harare": "ZW",
  "Africa/Lusaka": "ZM",
  "Africa/Maputo": "MZ",
  "Africa/Windhoek": "NA",
  "Africa/Gaborone": "BW",
  "Africa/Blantyre": "MW",
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "Africa/Tripoli": "LY",
  "Europe/London": "GB",
  "Europe/Jersey": "GB",
  "Europe/Guernsey": "GB",
  "Europe/Isle_of_Man": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Lisbon": "PT",
  "Europe/Vienna": "AT",
  "Europe/Zurich": "CH",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Budapest": "HU",
  "Europe/Bucharest": "RO",
  "Europe/Athens": "GR",
  "Europe/Sofia": "BG",
  "Europe/Istanbul": "TR",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "America/Adak": "US",
  "America/Boise": "US",
  "America/Detroit": "US",
  "America/Indiana/Indianapolis": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Montreal": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "America/Santiago": "CL",
  "Asia/Dubai": "AE",
  "Asia/Qatar": "QA",
  "Asia/Riyadh": "SA",
  "Asia/Kuwait": "KW",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "Asia/Shanghai": "CN",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Bangkok": "TH",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Pacific/Auckland": "NZ",
};

export function countryFromTimezone(tz: string | null | undefined): string | null {
  const key = (tz ?? "").trim();
  if (!key || key.length > 64) return null;
  return TIMEZONE_TO_COUNTRY[key] ?? null;
}

/** `en-NG`, `en_NG`, `en-NG-u-ca-gregory` → NG. Bare `en` → null. */
export function countryFromLocale(locale: string | null | undefined): string | null {
  const raw = (locale ?? "").trim();
  if (!raw || raw.length > 80) return null;
  const first = raw.split(",")[0]?.trim() ?? "";
  const tag = first.split(";")[0]?.trim() ?? "";
  const m = tag.match(/^[A-Za-z]{2,3}[-_]([A-Za-z]{2})(?:[-_]|$)/);
  return m ? cleanCountry(m[1]) : null;
}

function countryFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const country = countryFromLocale(part);
    if (country) return country;
  }
  return null;
}

function platformCountry(headers: { get(name: string): string | null }): string | null {
  return cleanCountry(headers.get("x-vercel-ip-country")) ?? cleanCountry(headers.get("cf-ipcountry"));
}

/**
 * Resolve a billing country from request headers + optional device hints.
 * Never takes a client-supplied country code.
 */
export function detectCountryFromSignals(
  headers: { get(name: string): string | null },
  hints: LocationHints = {},
): LocationGuess {
  const platform = platformCountry(headers);
  if (platform) return { country: platform, source: "platform" };

  const ipTz = countryFromTimezone(headers.get("x-vercel-ip-timezone"));
  if (ipTz) return { country: ipTz, source: "ip-timezone" };

  const deviceTz = countryFromTimezone(hints.timezone);
  if (deviceTz) return { country: deviceTz, source: "timezone" };

  const locale =
    countryFromLocale(hints.locale) ??
    countryFromAcceptLanguage(headers.get("accept-language"));
  if (locale) return { country: locale, source: "locale" };

  return { country: null, source: "none" };
}

/**
 * Country we charge in. Same order as detectCountryFromSignals:
 * IP country, then IP timezone, then device timezone, then locale.
 * IP country wins over a mismatched device timezone.
 */
export function chargeCountryFromSignals(
  headers: { get(name: string): string | null },
  hints: LocationHints = {},
): LocationGuess {
  return detectCountryFromSignals(headers, hints);
}

/** Browser-only: timezone + locale the device already knows. */
export function deviceRegionHints(): LocationHints {
  if (typeof Intl === "undefined") return {};
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale =
    (typeof navigator !== "undefined" && (navigator.language || navigator.languages?.[0])) ||
    Intl.DateTimeFormat().resolvedOptions().locale;
  return {
    ...(timezone ? { timezone } : {}),
    ...(locale ? { locale } : {}),
  };
}
