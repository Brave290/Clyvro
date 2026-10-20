import type { ScanReport } from "@/lib/scanner/types";

export const PUBLIC_SCAN_REPORT_KEY = "clyvro:public-scan:report-v1";
export const PUBLIC_SCAN_REPORT_CACHE_VERSION = 1;
export const PUBLIC_SCAN_REPORT_TTL_MS = 24 * 60 * 60 * 1000;

export interface PublicScanStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CachedPublicScanReport {
  version: typeof PUBLIC_SCAN_REPORT_CACHE_VERSION;
  url: string;
  savedAt: number;
  report: ScanReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isScanReport(value: unknown): value is ScanReport {
  if (!isRecord(value)) return false;
  if (!(["completed", "partial", "failed"] as const).includes(value.status as ScanReport["status"])) return false;
  if (typeof value.target !== "string" || value.target.trim() === "") return false;
  if (typeof value.finalUrl !== "string" && value.finalUrl !== null) return false;
  if (typeof value.startedAt !== "string" || !Number.isFinite(Date.parse(value.startedAt))) return false;
  if (!isFiniteNumber(value.durationMs) || typeof value.rulesetVersion !== "string") return false;
  if (value.score !== null && !isFiniteNumber(value.score)) return false;
  if (!Array.isArray(value.findings) || !Array.isArray(value.pages) || !Array.isArray(value.limitations)) return false;
  if (value.auditTypes !== undefined && !Array.isArray(value.auditTypes)) return false;
  if (value.error !== null && (!isRecord(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string")) return false;
  const coverage = isRecord(value.coverage) ? value.coverage : null;
  if (!coverage) return false;
  const coverageKeys = [
    "pagesFetched", "pagesParsed", "linksDiscovered", "linksChecked", "linksUnchecked",
    "formDestinationsChecked", "skippedByRobots", "truncatedPages", "maxPages", "maxDepth",
  ];
  if (!coverageKeys.every((key) => isFiniteNumber(coverage[key]))) return false;
  return typeof coverage.deadlineHit === "boolean";
}

function normalizeUrl(value: string): string {
  return value.trim();
}

export function cachePublicScanReport(
  storage: PublicScanStorage,
  url: string,
  report: ScanReport,
  savedAt = Date.now(),
): void {
  if (!isScanReport(report) || !normalizeUrl(url) || !Number.isFinite(savedAt)) return;
  try {
    const entry: CachedPublicScanReport = {
      version: PUBLIC_SCAN_REPORT_CACHE_VERSION,
      url: normalizeUrl(url),
      savedAt,
      report,
    };
    storage.setItem(PUBLIC_SCAN_REPORT_KEY, JSON.stringify(entry));
  } catch {
    // Storage can be disabled or full; the current page can still show the report.
  }
}

export function clearPublicScanReport(storage: PublicScanStorage): void {
  try {
    storage.removeItem(PUBLIC_SCAN_REPORT_KEY);
  } catch {
    // Storage may be disabled.
  }
}

export function restorePublicScanReport(
  storage: PublicScanStorage,
  requestedUrl?: string | null,
  now = Date.now(),
): CachedPublicScanReport | null {
  let raw: string | null;
  try {
    raw = storage.getItem(PUBLIC_SCAN_REPORT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearPublicScanReport(storage);
    return null;
  }
  if (!isRecord(parsed)) {
    clearPublicScanReport(storage);
    return null;
  }
  const { version, url, savedAt, report } = parsed;
  if (version !== PUBLIC_SCAN_REPORT_CACHE_VERSION || typeof url !== "string" || !url.trim() ||
      !isFiniteNumber(savedAt) || !isScanReport(report) || !Number.isFinite(now) ||
      savedAt > now || now - savedAt > PUBLIC_SCAN_REPORT_TTL_MS) {
    clearPublicScanReport(storage);
    return null;
  }
  if (requestedUrl != null && normalizeUrl(url) !== normalizeUrl(requestedUrl)) return null;
  return { version: PUBLIC_SCAN_REPORT_CACHE_VERSION, url, savedAt, report };
}
