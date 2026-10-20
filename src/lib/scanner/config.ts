/**
 * Scanner limits. Every bound is deliberate: the Phase 2 scanner must be
 * safe to run against untrusted targets and must always terminate.
 * Optional environment overrides are documented in .env.example.
 */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

export const SCAN_CONFIG = {
  /** Pages fully fetched and parsed (including the start page). */
  maxPages: envInt("SCAN_MAX_PAGES", 10, 1, 25),
  /** Extra same-origin URLs verified with headers-only requests (broken-link checks). */
  maxLinkChecks: envInt("SCAN_MAX_LINK_CHECKS", 20, 0, 40),
  maxDepth: 2,
  maxRedirects: 5,
  /** Decoded body cap per page (1.5 MB) — content beyond this is truncated, never buffered whole. */
  maxBytesPerPage: 1_500_000,
  requestTimeoutMs: envInt("SCAN_REQUEST_TIMEOUT_MS", 8_000, 1_000, 20_000),
  /** Hard wall-clock budget for the whole scan. */
  deadlineMs: envInt("SCAN_DEADLINE_MS", 45_000, 5_000, 55_000),
  userAgent: "ClyvroBot/0.1 (Phase 2 prototype website auditor; fetches only URLs submitted by its users)",
};

export const RULESET_VERSION = "1.0.0";
