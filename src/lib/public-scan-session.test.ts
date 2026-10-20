import { describe, expect, it } from "vitest";
import type { ScanReport } from "@/lib/scanner/types";
import {
  PUBLIC_SCAN_REPORT_KEY,
  PUBLIC_SCAN_REPORT_TTL_MS,
  cachePublicScanReport,
  restorePublicScanReport,
  type PublicScanStorage,
} from "./public-scan-session";

class FakeStorage implements PublicScanStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const report: ScanReport = {
  status: "completed",
  target: "https://example.com",
  finalUrl: "https://example.com/",
  startedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 123,
  rulesetVersion: "test",
  score: 92,
  findings: [],
  pages: [],
  coverage: {
    pagesFetched: 1,
    pagesParsed: 1,
    linksDiscovered: 0,
    linksChecked: 0,
    linksUnchecked: 0,
    formDestinationsChecked: 0,
    skippedByRobots: 0,
    truncatedPages: 0,
    maxPages: 10,
    maxDepth: 2,
    deadlineHit: false,
  },
  limitations: [],
  error: null,
};

describe("public scan terminal report session", () => {
  it("restores a cached report for the same URL", () => {
    const storage = new FakeStorage();
    cachePublicScanReport(storage, " https://example.com ", report, 1_000);

    const restored = restorePublicScanReport(storage, "https://example.com", 1_001);

    expect(restored?.report).toEqual(report);
    expect(restored?.url).toBe("https://example.com");
  });

  it("does not restore a cached report for a different URL", () => {
    const storage = new FakeStorage();
    cachePublicScanReport(storage, "https://example.com", report, 1_000);

    expect(restorePublicScanReport(storage, "https://other.example", 1_001)).toBeNull();
    expect(storage.getItem(PUBLIC_SCAN_REPORT_KEY)).not.toBeNull();
  });

  it("rejects and clears a stale cached report", () => {
    const storage = new FakeStorage();
    cachePublicScanReport(storage, "https://example.com", report, 1_000);

    expect(restorePublicScanReport(storage, "https://example.com", 1_000 + PUBLIC_SCAN_REPORT_TTL_MS + 1)).toBeNull();
    expect(storage.getItem(PUBLIC_SCAN_REPORT_KEY)).toBeNull();
  });
});
