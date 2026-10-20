export const DISPLAY_CURRENCIES = [
  ["USD", "US dollar"], ["NGN", "Nigerian naira"], ["GBP", "British pound"], ["EUR", "Euro"],
  ["CAD", "Canadian dollar"], ["AUD", "Australian dollar"], ["NZD", "New Zealand dollar"],
  ["INR", "Indian rupee"], ["ZAR", "South African rand"], ["KES", "Kenyan shilling"],
  ["GHS", "Ghanaian cedi"], ["JPY", "Japanese yen"], ["CNY", "Chinese yuan"],
  ["SGD", "Singapore dollar"], ["AED", "UAE dirham"], ["BRL", "Brazilian real"],
  ["MXN", "Mexican peso"], ["CHF", "Swiss franc"], ["SEK", "Swedish krona"],
  ["NOK", "Norwegian krone"], ["DKK", "Danish krone"], ["PKR", "Pakistani rupee"],
  ["BDT", "Bangladeshi taka"], ["IDR", "Indonesian rupiah"], ["PHP", "Philippine peso"],
  ["THB", "Thai baht"], ["KRW", "South Korean won"], ["SAR", "Saudi riyal"],
  ["TRY", "Turkish lira"], ["PLN", "Polish złoty"], ["EGP", "Egyptian pound"], ["ISK", "Icelandic króna"],
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number][0];
export const DISPLAY_CURRENCY_CODES = DISPLAY_CURRENCIES.map(([code]) => code) as DisplayCurrency[];
export const isDisplayCurrency = (value: string): value is DisplayCurrency =>
  DISPLAY_CURRENCY_CODES.includes(value as DisplayCurrency);

const REGION_CURRENCY: Record<string, DisplayCurrency> = {
  US: "USD", NG: "NGN", GB: "GBP", IE: "EUR", CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR",
  ZA: "ZAR", KE: "KES", GH: "GHS", JP: "JPY", CN: "CNY", SG: "SGD", AE: "AED", BR: "BRL",
  MX: "MXN", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PK: "PKR", BD: "BDT", ID: "IDR",
  PH: "PHP", TH: "THB", KR: "KRW", SA: "SAR", TR: "TRY", PL: "PLN", EG: "EGP",
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR", FR: "EUR",
  GR: "EUR", HR: "EUR", IT: "EUR", LT: "EUR", LU: "EUR", LV: "EUR", MT: "EUR", NL: "EUR",
  PT: "EUR", SI: "EUR", SK: "EUR", BG: "EUR", MC: "EUR", AD: "EUR", VA: "EUR", SM: "EUR",
  IS: "ISK",
};

export function currencyForRegion(region: string | undefined): DisplayCurrency {
  return region ? REGION_CURRENCY[region.toUpperCase()] ?? "USD" : "USD";
}
