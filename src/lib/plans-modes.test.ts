import { describe, it, expect } from "vitest";
import { PLANS, effectivePlan, planAtLeast } from "./plans";
import { scanLimitsForMode, isScanMode } from "./scan-modes";

const byId = (id: string) => PLANS.find((p) => p.id === id)!;

describe("plan catalogue (raised limits, Freemium unchanged)", () => {
  it("Freemium stays 3 scans / 10 pages / 1 project", () => {
    const f = byId("freemium");
    expect(f.scansPerMonth).toBe(3);
    expect(f.maxPagesPerScan).toBe(10);
    expect(f.maxProjects).toBe(1);
  });
  it("paid plans are raised exactly as published", () => {
    expect(byId("basic")).toMatchObject({ scansPerMonth: 60, maxPagesPerScan: 250, maxProjects: 5 });
    expect(byId("pro")).toMatchObject({ scansPerMonth: 300, maxPagesPerScan: 1000, maxProjects: 25 });
    expect(byId("ultra-agency")).toMatchObject({ scansPerMonth: 1500, maxPagesPerScan: 2000, maxProjects: 200 });
  });
  it("deep scans: Pro+ only; readiness tiers; cron quotas", () => {
    expect(byId("freemium").deepScans).toBe(false);
    expect(byId("basic").deepScans).toBe(false);
    expect(byId("pro").deepScans).toBe(true);
    expect(byId("ultra-agency").deepScans).toBe(true);
    expect(byId("pro").readiness).toBe("basic");
    expect(byId("ultra-agency").readiness).toBe("full");
    expect(byId("freemium").maxCronJobs).toBe(1);
    expect(byId("ultra-agency").maxCronJobs).toBe(200);
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
