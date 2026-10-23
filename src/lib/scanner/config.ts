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
  /** Hard wall-clock budget for one resumable invocation. */
  deadlineMs: envInt("SCAN_DEADLINE_MS", 45_000, 5_000, 55_000),
  /** Fail-closed bound for each DNS lookup, including redirect revalidation. */
  dnsLookupTimeoutMs: envInt("SCAN_DNS_TIMEOUT_MS", 2_000, 50, 10_000),
  /** Hard maximum lifetime of persisted progress across invocations. */
  checkpointLifetimeMs: envInt("SCAN_CHECKPOINT_LIFETIME_MS", 24 * 60 * 60 * 1000, 60_000, 30 * 24 * 60 * 60 * 1000),
  /**
   * Absolute wall-clock cap for one scan job end to end (all slices).
   * A job older than this transitions to `timed_out` with its durable
   * progress preserved — it can never sit in "running" forever.
   */
  jobMaxDurationMs: envInt("SCAN_JOB_MAX_DURATION_MS", 2 * 60 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000),
  /** Maximum fetch/check operations one resumable invocation may perform. */
  sliceWorkBudget: envInt("SCAN_SLICE_WORK_BUDGET", 8, 1, 50),
  /**
   * Pages fetched in parallel within a crawl. Sequential fetching made
   * deep scans time out (2,000 pages x ~1s each blew the 2h job cap);
   * bounded parallelism keeps total requests identical, just concurrent.
   * Still one connection per target host at the transport layer per
   * request — politeness comes from the small bound, robots rules and
   * per-request timeouts.
   */
  pageConcurrency: envInt("SCAN_PAGE_CONCURRENCY", 5, 1, 10),
  /** Serialized checkpoint guardrails; checkpoints never contain response bodies.
      Sized for deep scans (thousands of page summaries), still hard-bounded. */
  maxCheckpointBytes: envInt("SCAN_MAX_CHECKPOINT_BYTES", 4_000_000, 32_000, 8_000_000),
  maxCheckpointItems: envInt("SCAN_MAX_CHECKPOINT_ITEMS", 20_000, 100, 60_000),
  userAgent: `Clyvro-Dev-Crawler/1.0 (+${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "")})`,
};

export const RULESET_VERSION = "7.0.0";
