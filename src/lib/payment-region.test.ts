import { afterEach, describe, expect, it } from "vitest";
import { verifyPaymentRegion } from "@/lib/services/payment-region";

const headers = (h: Record<string, string>) => new Headers(h);
const intelFetch = (payload: unknown) =>
  async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  delete process.env.PAYMENT_IP_INTEL_URL;
  delete process.env.PAYMENT_IP_INTEL_KEY;
});

describe("payment region verification", () => {
  it("allows when declared country matches the platform geo header", async () => {
    const v = await verifyPaymentRegion(headers({ "x-vercel-ip-country": "NG" }), "NG");
    expect(v.decision).toBe("allow");
    expect(v.ipCountry).toBe("NG");
    expect(v.source).toBe("platform");
  });

  it("blocks a billing-country / connection-region mismatch with a plain reason", async () => {
    const v = await verifyPaymentRegion(headers({ "x-vercel-ip-country": "US" }), "NG");
    expect(v.decision).toBe("block");
    expect(v.reason).toMatch(/doesn't match/);
  });

  it("discards VPN/proxy connections when the intel source flags them", async () => {
    process.env.PAYMENT_IP_INTEL_URL = "https://intel.example/{ip}";
    const v = await verifyPaymentRegion(
      headers({ "x-forwarded-for": "8.8.8.8" }), "US",
      { fetchImpl: intelFetch({ countryCode: "US", proxy: true, hosting: false }) },
    );
    expect(v.decision).toBe("block");
    expect(v.vpnDetected).toBe(true);
    expect(v.reason).toMatch(/VPN or proxy/);
  });

  it("intel country wins over the platform header when both exist", async () => {
    process.env.PAYMENT_IP_INTEL_URL = "https://intel.example/{ip}";
    const v = await verifyPaymentRegion(
      headers({ "x-forwarded-for": "8.8.8.8", "x-vercel-ip-country": "GB" }), "NG",
      { fetchImpl: intelFetch({ countryCode: "NG", proxy: false }) },
    );
    expect(v.decision).toBe("allow");
    expect(v.source).toBe("intel");
    expect(v.ipCountry).toBe("NG");
  });

  it("never fabricates: no signal at all → allow, source 'none', vpn unknown", async () => {
    const v = await verifyPaymentRegion(headers({}), "NG");
    expect(v.decision).toBe("allow");
    expect(v.source).toBe("none");
    expect(v.ipCountry).toBeNull();
    expect(v.vpnDetected).toBeNull();
  });

  it("an intel outage falls back to the platform header instead of blocking buyers", async () => {
    process.env.PAYMENT_IP_INTEL_URL = "https://intel.example/{ip}";
    const failing = async () => { throw new Error("down"); };
    const v = await verifyPaymentRegion(
      headers({ "x-forwarded-for": "8.8.8.8", "x-vercel-ip-country": "NG" }), "NG",
      { fetchImpl: failing },
    );
    expect(v.decision).toBe("allow");
    expect(v.source).toBe("platform");
  });
});
