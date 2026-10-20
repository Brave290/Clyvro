import { auditScore } from "@/lib/types";
import { SCAN_CONFIG, RULESET_VERSION } from "./config";
import { assertPublicUrl, type Resolver } from "./ssrf";
import { fetchPublic, type Transport } from "./fetcher";
import { crawlSite, type FetchPageFn } from "./crawl";
import { runRules } from "./rules";
import { ScanError, type ScanReport } from "./types";

/**
 * Scan orchestration. Validation failures (bad/blocked/unresolvable URL)
 * throw ScanError for the API layer to return as a 4xx. Everything that
 * happens after a valid target is accepted is reported inside ScanReport —
 * including the target being down — so the UI can present it honestly.
 *
 * The ScanReport JSON shape is the contract a future background worker
 * (Phase 3) will produce unchanged.
 */

export interface ScanDeps {
  resolver?: Resolver;
  transport?: Transport;
  now?: () => number;
}

const BASE_LIMITATIONS = [
  "Pages were inspected as raw HTML over HTTP. Content that only appears after JavaScript runs may be missed.",
  "Forms were never submitted and no data was sent to the site. Form destinations were checked with a safe, body-less GET request.",
  "Performance measurements (e.g. Core Web Vitals) are not part of this Phase 2 scanner yet.",
  "This scan is not saved anywhere. Accounts, projects and history arrive in Phase 3.",
];

/** Accept "example.com" style input by assuming https; explicit schemes are validated strictly. */
export function normalizeScanInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length > 2048) throw new ScanError("INVALID_URL", "That URL is too long.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // e.g. "javascript:..." — validation will reject it
  return `https://${trimmed}`;
}

function emptyReport(partial: Partial<ScanReport> & Pick<ScanReport, "target" | "startedAt">): ScanReport {
  return {
    status: "failed",
    finalUrl: null,
    durationMs: 0,
    rulesetVersion: RULESET_VERSION,
    score: null,
    findings: [],
    pages: [],
    coverage: {
      pagesFetched: 0, pagesParsed: 0, linksDiscovered: 0, linksChecked: 0,
      linksUnchecked: 0, formDestinationsChecked: 0, skippedByRobots: 0,
      truncatedPages: 0, maxPages: SCAN_CONFIG.maxPages, maxDepth: SCAN_CONFIG.maxDepth, deadlineHit: false,
    },
    limitations: BASE_LIMITATIONS,
    error: null,
    ...partial,
  };
}

export async function runScan(rawInput: string, deps: ScanDeps = {}): Promise<ScanReport> {
  const now = deps.now ?? Date.now;
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();

  // 1) Validate (throws ScanError → API 4xx).
  const normalized = normalizeScanInput(rawInput);
  const target = await assertPublicUrl(normalized, deps.resolver);

  // 2) Crawl under a hard deadline.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), SCAN_CONFIG.deadlineMs);
  const fetchPage: FetchPageFn = (url, opts) =>
    fetchPublic(url, {
      headersOnly: opts.headersOnly,
      allowNonHtmlBody: opts.allowNonHtmlBody,
      maxBytes: opts.maxBytes,
      signal: opts.signal,
      resolver: deps.resolver,
      transport: deps.transport,
    });

  try {
    const crawl = await crawlSite(target.url, {
      fetchPage,
      now,
      deadlineAt: startedAtMs + SCAN_CONFIG.deadlineMs,
      signal: deadline.signal,
    });

    const { startOutcome } = crawl;
    const pageSummaries = crawl.pages.map((p) => ({
      url: p.url, status: p.status, bytes: p.bytes, durationMs: p.durationMs, title: p.title,
    }));
    for (const f of crawl.failures) {
      pageSummaries.push({ url: f.url, status: 0, bytes: 0, durationMs: 0, title: null });
    }

    if (startOutcome.status < 200 || startOutcome.status >= 300) {
      return emptyReport({
        target: target.url.href, startedAt,
        finalUrl: startOutcome.finalUrl,
        durationMs: now() - startedAtMs,
        pages: pageSummaries,
        coverage: crawl.coverage,
        error: {
          code: "TARGET_ERROR_STATUS",
          message: `The page returned HTTP ${startOutcome.status}, so there's nothing to audit. If the site works in your browser, it may be blocking automated requests.`,
        },
      });
    }
    if (!startOutcome.isHtml) {
      return emptyReport({
        target: target.url.href, startedAt,
        finalUrl: startOutcome.finalUrl,
        durationMs: now() - startedAtMs,
        pages: pageSummaries,
        coverage: crawl.coverage,
        error: {
          code: "NOT_HTML",
          message: "That URL didn't return an HTML page, so it can't be audited as a web page.",
        },
      });
    }

    const findings = runRules({
      pages: crawl.pages,
      fetches: crawl.fetches,
      referrers: crawl.referrers,
      startPageUrl: startOutcome.finalUrl,
    });

    const limitations = [...BASE_LIMITATIONS];
    limitations.splice(1, 0, `Only same-origin pages up to ${SCAN_CONFIG.maxDepth} clicks from the submitted URL were checked (max ${SCAN_CONFIG.maxPages} pages read in full).`);
    if (crawl.coverage.linksUnchecked > 0) {
      limitations.push(`${crawl.coverage.linksUnchecked} discovered internal link(s) couldn't be verified within the scan limits, so broken-link coverage is partial.`);
    }
    if (crawl.coverage.skippedByRobots > 0) {
      limitations.push(`${crawl.coverage.skippedByRobots} URL(s) were skipped because the site's robots.txt disallows automated access to them.`);
    }
    if (crawl.coverage.truncatedPages > 0) {
      limitations.push(`${crawl.coverage.truncatedPages} page(s) exceeded the per-page size cap and were only partially inspected.`);
    }
    if (crawl.coverage.deadlineHit) {
      limitations.push("The scan hit its time limit before covering everything within the page limits — treat this as a partial audit.");
    }

    return {
      status: crawl.coverage.deadlineHit ? "partial" : "completed",
      target: target.url.href,
      finalUrl: startOutcome.finalUrl,
      startedAt,
      durationMs: now() - startedAtMs,
      rulesetVersion: RULESET_VERSION,
      score: auditScore(findings),
      findings,
      pages: pageSummaries,
      coverage: crawl.coverage,
      limitations,
      error: null,
    };
  } catch (err) {
    if (err instanceof ScanError) {
      // Target accepted but unreachable / too slow / misbehaving redirects.
      return emptyReport({
        target: target.url.href, startedAt,
        durationMs: now() - startedAtMs,
        error: { code: err.code, message: err.message },
      });
    }
    return emptyReport({
      target: target.url.href, startedAt,
      durationMs: now() - startedAtMs,
      error: { code: "INTERNAL", message: "Something went wrong while scanning. Please try again." },
    });
  } finally {
    clearTimeout(timer);
  }
}
