import { describe, it, expect } from "vitest";
import { PLANS, effectivePlan, planAtLeast } from "./plans";
import { scanLimitsForMode, isScanMode } from "./scan-modes";

const byId = (id: string) => PLANS.find((p) => p.id === id)!;

describe("plan catalogue (raised limits)", () => {
  it("Freemium is 10 scans / 10 pages / 1 project (founder-approved increase)", () => {
    const f = byId("freemium");
    expect(f.scansPerMonth).toBe(10);
    expect(f.maxPagesPerScan).toBe(10);
    expect(f.maxProjects).toBe(1);
  });
  it("paid plans are raised exactly as published", () => {
    expect(byId("basic")).toMatchObject({ scansPerMonth: 60, maxPagesPerScan: 250, maxProjects: 5 });
    expect(byId("pro")).toMatchObject({ scansPerMonth: 300, maxPagesPerScan: 1000, maxProjects: 25 });
    expect(byId("ultra-agency")).toMatchObject({ scansPerMonth: 1500, maxPagesPerScan: 2000, maxProjects: 200 });
  });
  it("premium tools: every plan can test, lower plans capped, Ultra unlimited", () => {
    // Founder rule (Oct 2026): all tools available on all plans,
    // limited for the lower ones. Booleans became run allowances.
    expect(byId("freemium").flowScan).toEqual({ count: 1, period: "monthly" });
    expect(byId("basic").flowScan).toEqual({ count: 5, period: "monthly" });
    expect(byId("pro").flowScan).toEqual({ count: 25, period: "monthly" });
    expect(byId("ultra-agency").flowScan).toBeNull();
    expect(byId("freemium").aiDetector).toEqual({ count: 2, period: "lifetime" });
    expect(byId("basic").aiDetector).toEqual({ count: 10, period: "monthly" });
    expect(byId("pro").aiDetector).toEqual({ count: 50, period: "monthly" });
    expect(byId("ultra-agency").aiDetector).toBeNull();
    expect(byId("freemium").deepScans).toEqual({ count: 1, period: "lifetime" });
    expect(byId("basic").deepScans).toEqual({ count: 3, period: "monthly" });
    expect(byId("pro").deepScans).toEqual({ count: 25, period: "monthly" });
    expect(byId("ultra-agency").deepScans).toBeNull();
    expect(byId("pro").readiness).toBe("basic");
    expect(byId("ultra-agency").readiness).toBe("full");
    expect(byId("freemium").maxCronJobs).toBe(1);
    expect(byId("ultra-agency").maxCronJobs).toBe(200);
  });
  it("allowanceText renders honest pricing labels", async () => {
    const { allowanceText } = await import("./plans");
    expect(allowanceText(null)).toBe("Unlimited");
    expect(allowanceText({ count: 5, period: "monthly" })).toBe("5 runs/month");
    expect(allowanceText({ count: 2, period: "lifetime" }, "checks")).toBe("2 free checks (lifetime)");
  });
  it("Beta/dev tool allowances: free tastes, paid monthly, Ultra unlimited", () => {
    expect(byId("freemium").tools.hackSeo).toEqual({ count: 2, period: "lifetime" });
    expect(byId("freemium").tools.devTools).toEqual({ count: 3, period: "lifetime-per-tool" });
    expect(byId("basic").tools.hackSeo).toEqual({ count: 5, period: "monthly" });
    expect(byId("pro").tools.devTools).toEqual({ count: 100, period: "monthly-pooled" });
    expect(byId("ultra-agency").tools.hackSeo).toBeNull();
    expect(byId("ultra-agency").tools.devTools).toBeNull();
  });
});

describe("effectivePlan expiry", () => {
  it("lapsed paid plan falls back to Freemium", () => {
    expect(effectivePlan("pro", new Date(Date.now() - 1000)).id).toBe("freemium");
  });
  it("active paid plan is honoured; null expiry (owner comp) never lapses", () => {
    expect(effectivePlan("pro", new Date(Date.now() + 1000)).id).toBe("pro");
    expect(effectivePlan("ultra-agency", null).id).toBe("ultra-agency");
    expect(effectivePlan("pro").id).toBe("pro");
  });
  it("unknown plan id behaves like Freemium", () => {
    expect(effectivePlan("nope").id).toBe("freemium");
  });
});

describe("scanLimitsForMode", () => {
  it("normal caps at 25 pages / 20 links / depth 2 for everyone", () => {
    expect(scanLimitsForMode("normal", byId("ultra-agency"))).toEqual({ maxPages: 25, maxLinkChecks: 20, maxDepth: 2 });
    expect(scanLimitsForMode("normal", byId("freemium")).maxPages).toBe(10);
  });
  it("strict: paid verifies 1000 links, free 200", () => {
    expect(scanLimitsForMode("strict", byId("basic"))).toMatchObject({ maxLinkChecks: 1000, maxDepth: 3 });
    expect(scanLimitsForMode("strict", byId("freemium"))).toMatchObject({ maxLinkChecks: 200 });
    expect(scanLimitsForMode("strict", byId("pro")).maxPages).toBe(1000);
  });
  it("deep reaches the engine ceilings (2000 pages / 5000 links / depth 5)", () => {
    expect(scanLimitsForMode("deep", byId("ultra-agency"))).toEqual({ maxPages: 2000, maxLinkChecks: 5000, maxDepth: 5 });
    expect(scanLimitsForMode("deep", byId("pro"))).toEqual({ maxPages: 1000, maxLinkChecks: 5000, maxDepth: 5 });
  });
  it("isScanMode accepts deep and rejects junk", () => {
    expect(isScanMode("deep")).toBe(true);
    expect(isScanMode("mega")).toBe(false);
    expect(isScanMode(undefined)).toBe(false);
  });
  it("planAtLeast orders plans", () => {
    expect(planAtLeast(byId("pro"), "basic")).toBe(true);
    expect(planAtLeast(byId("basic"), "pro")).toBe(false);
  });
});
