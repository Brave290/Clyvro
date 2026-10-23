import { afterEach, describe, expect, it } from "vitest";
import { verifyPaymentRegion } from "@/lib/services/payment-region";
import {
  countryFromLocale, countryFromTimezone, detectCountryFromSignals,
} from "@/lib/billing-location";
import { chargeCurrency, countryDisplayName, payNotice } from "@/lib/billing";
import { flutterwavePayloadHash } from "@/lib/services/billing";
import { createHash } from "node:crypto";

const headers = (h: Record<string, string>) => new Headers(h);
const intelFetch = (payload: unknown) =>
  async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  delete process.env.PAYMENT_IP_INTEL_URL;
  delete process.env.PAYMENT_IP_INTEL_KEY;
  delete process.env.FLUTTERWAVE_SECRET_KEY;
});

describe("location signals (no country picker)", () => {
  it("maps device timezone Africa/Lagos to Nigeria", () => {
    expect(countryFromTimezone("Africa/Lagos")).toBe("NG");
    expect(countryFromTimezone("Europe/London")).toBe("GB");
    expect(countryFromTimezone("not-a-zone")).toBeNull();
  });

  it("reads a region subtag from locale / Accept-Language", () => {
    expect(countryFromLocale("en-NG")).toBe("NG");
    expect(countryFromLocale("en-NG,en;q=0.9")).toBe("NG");
    expect(countryFromLocale("en")).toBeNull();
  });

  it("IP country beats a conflicting device timezone — currency follows IP", () => {
    const g = detectCountryFromSignals(
      headers({ "x-vercel-ip-country": "US" }),
      { timezone: "Africa/Lagos", locale: "en-NG" },
    );
    expect(g).toEqual({ country: "US", source: "platform" });
    expect(chargeCurrency(headers({ "x-vercel-ip-country": "US" }), { timezone: "Africa/Lagos" })).toBe("USD");
    expect(chargeCurrency(headers({ "x-vercel-ip-country": "US" }), { locale: "en-NG" })).toBe("USD");
  });

  it("falls back to timezone, then locale, when IP is missing", () => {
    expect(detectCountryFromSignals(headers({}), { timezone: "Africa/Lagos" }))
      .toEqual({ country: "NG", source: "timezone" });
    expect(detectCountryFromSignals(headers({ "accept-language": "en-GB,en;q=0.8" })))
      .toEqual({ country: "GB", source: "locale" });
    expect(chargeCurrency(headers({}), { timezone: "Africa/Lagos" })).toBe("NGN");
    expect(chargeCurrency(headers({ "x-vercel-ip-country": "NG" }))).toBe("NGN");
    expect(chargeCurrency(headers({ "x-vercel-ip-country": "GB" }))).toBe("USD");
    expect(chargeCurrency(headers({ "x-vercel-ip-country": "US" }))).toBe("USD");
    expect(chargeCurrency(headers({}))).toBe("USD");
  });

  it("uses Vercel's IP timezone header when country header is absent — Ghana still pays USD", () => {
    expect(detectCountryFromSignals(headers({ "x-vercel-ip-timezone": "Africa/Accra" })))
      .toEqual({ country: "GH", source: "ip-timezone" });
    expect(chargeCurrency(headers({ "x-vercel-ip-timezone": "Africa/Accra" }))).toBe("USD");
  });

  it("tells the buyer their region and that non-Nigeria pays in USD", () => {
    expect(countryDisplayName("NG")).toBe("Nigeria");
    expect(countryDisplayName("GB")).toBe("United Kingdom");
    expect(payNotice("NG", "NGN")).toMatch(/Nigeria.*naira \(NGN\)/);
    expect(payNotice("GB", "USD")).toMatch(/United Kingdom.*US dollars \(USD\)/);
    expect(payNotice(null, "USD")).toMatch(/couldn't pin your country.*US dollars \(USD\)/);
  });
});

describe("Flutterwave payload_hash", () => {
  it("matches the checksum docs: sha256(amount + currency + email + tx_ref + sha256(secret))", () => {
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-secret";
    const hashedSecret = createHash("sha256").update("FLWSECK_TEST-secret", "utf8").digest("hex");
    const expected = createHash("sha256")
      .update(`75000NGNuser@example.comclyvro_abc${hashedSecret}`, "utf8")
      .digest("hex");
    expect(flutterwavePayloadHash(75000, "NGN", "user@example.com", "clyvro_abc")).toBe(expected);
    expect(expected).toHaveLength(64);
  });
});

describe("payment region verification", () => {
  it("allows and reports the IP country — no declared country required", async () => {
    const v = await verifyPaymentRegion(headers({ "x-vercel-ip-country": "NG" }));
    expect(v.decision).toBe("allow");
    expect(v.country).toBe("NG");
    expect(v.ipCountry).toBe("NG");
    expect(v.source).toBe("platform");
  });

  it("does not let a client-supplied timezone override the IP country", async () => {
    const v = await verifyPaymentRegion(headers({ "x-vercel-ip-country": "US" }), { timezone: "Africa/Lagos" });
    expect(v.decision).toBe("allow");
    expect(v.country).toBe("US");
  });

  it("does not block VPN/proxy connections — intel is country only", async () => {
    process.env.PAYMENT_IP_INTEL_URL = "https://intel.example/{ip}";
    const v = await verifyPaymentRegion(
      headers({ "x-forwarded-for": "8.8.8.8" }), {},
      { fetchImpl: intelFetch({ countryCode: "US", proxy: true, hosting: true }) },
    );
    expect(v.decision).toBe("allow");
    expect(v.country).toBe("US");
    expect(v.source).toBe("intel");
  });

  it("intel country wins over the platform header when both exist", async () => {
    process.env.PAYMENT_IP_INTEL_URL = "https://intel.example/{ip}";
    const v = await verifyPaymentRegion(
      headers({ "x-forwarded-for": "8.8.8.8", "x-vercel-ip-country": "GB" }), {},
      { fetchImpl: intelFetch({ countryCode: "NG", proxy: false }) },
    );
    expect(v.decision).toBe("allow");
    expect(v.source).toBe("intel");
    expect(v.country).toBe("NG");
    expect(v.ipCountry).toBe("NG");
  });

  it("never fabricates: no signal at all → allow, source 'none'", async () => {
    const v = await verifyPaymentRegion(headers({}));
    expect(v.decision).toBe("allow");
    expect(v.source).toBe("none");
    expect(v.country).toBeNull();
    expect(v.ipCountry).toBeNull();
  });

  it("an intel outage falls back to the platform header instead of blocking buyers", async () => {
    process.env.PAYMENT_IP_INTEL_URL = "https://intel.example/{ip}";
    const failing = async () => { throw new Error("down"); };
    const v = await verifyPaymentRegion(
      headers({ "x-forwarded-for": "8.8.8.8", "x-vercel-ip-country": "NG" }), {},
      { fetchImpl: failing },
    );
    expect(v.decision).toBe("allow");
    expect(v.source).toBe("platform");
    expect(v.country).toBe("NG");
  });

  it("timezone hint fills in when the connection has no country", async () => {
    const v = await verifyPaymentRegion(headers({}), { timezone: "Africa/Lagos", locale: "en-NG" });
    expect(v.decision).toBe("allow");
    expect(v.country).toBe("NG");
    expect(v.source).toBe("timezone");
  });
});
