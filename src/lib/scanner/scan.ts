import { auditScore } from "@/lib/types";
import { SCAN_CONFIG, RULESET_VERSION } from "./config";
import { assertPublicUrl, type Resolver } from "./ssrf";
import { fetchPublic, type Transport } from "./fetcher";
import { crawlSite, crawlSiteSlice, type FetchPageFn } from "./crawl";
import { runRules } from "./rules";
import { ScanError, type ScanCheckpoint, type ScanReport } from "./types";
import { normalizeLocale } from "@/lib/locale";

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
  /** Plan/mode-derived crawl bounds (still subject to scanner hard ceilings). */
  limits?: { maxPages?: number; maxLinkChecks?: number; maxDepth?: number };
  /** Audit-type focus. Absent/["generic"] = full ruleset. */
  auditTypes?: string[];
  /** BCP-47 locale used for content negotiation. */
  locale?: string;
  /** Deep scans: enumerate /sitemap.xml routes as well as following links. */
  sitemap?: boolean;
}

const BASE_LIMITATIONS = [
  "Pages were inspected as raw HTML over HTTP. Content that only appears after JavaScript runs may be missed.",
  "Forms were never submitted and no data was sent to the site. Form destinations were checked with a safe, body-less GET request.",
  "Speed findings use the server response times measured during this scan. Lab Core Web Vitals (LCP, CLS, INP) are not measured.",
  "Quick scans run from the public scanner page aren't saved to an account; scans run while signed in are saved with this exact report.",
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
  const locale = normalizeLocale(deps.locale);
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
      locale,
    });

  try {
    const crawl = await crawlSite(target.url, {
      fetchPage,
      now,
      deadlineAt: startedAtMs + SCAN_CONFIG.deadlineMs,
      signal: deadline.signal,
      limits: deps.limits,
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
      siteFiles: crawl.siteFiles,
    }, deps.auditTypes);

    const limitations = [...BASE_LIMITATIONS];
    limitations.splice(1, 0, `Only same-origin pages up to ${crawl.coverage.maxDepth} clicks from the submitted URL were checked (max ${crawl.coverage.maxPages} pages read in full).`);
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
      auditTypes: deps.auditTypes?.length ? deps.auditTypes : ["generic"],
      target: target.url.href,
      finalUrl: startOutcome.finalUrl,
      startedAt,
      durationMs: now() - startedAtMs,
      rulesetVersion: RULESET_VERSION,
      score: auditScore(findings),
      findings,
      tech: crawl.tech,
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

export interface ScanSliceDeps extends ScanDeps {
  /** A JSON string or parsed checkpoint returned by an earlier slice. */
  checkpoint?: string | ScanCheckpoint | unknown;
  /** Finite number of network operations allowed in this invocation. */
  workBudget?: number;
  signal?: AbortSignal;
}

export interface ScanSliceResult {
  status: "paused" | "completed" | "partial" | "failed";
  done: boolean;
  report: ScanReport | null;
  /** Parsed checkpoint suitable for JSON.stringify and persistence. */
  checkpoint: ScanCheckpoint | null;
  /** Convenience wire form; null when the slice is terminal. */
  checkpointJson: string | null;
}

const checkpointInvalid = (message = "The scan checkpoint is invalid or has been tampered with."): ScanError =>
  new ScanError("CHECKPOINT_INVALID", message);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000) return false;
  try { const u = new URL(value); return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password; }
  catch { return false; }
}
function isNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isStringArray(value: unknown, max: number): value is string[] { return Array.isArray(value) && value.length <= max && value.every((v) => typeof v === "string" && v.length <= 1000); }

/**
 * Parse and validate untrusted persisted progress. The parser intentionally
 * accepts only the versioned metadata shape and rejects raw response bodies.
 */
export function deserializeScanCheckpoint(input: unknown): ScanCheckpoint {
  let value: unknown = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input) as unknown; } catch { throw checkpointInvalid(); }
  }
  if (!isRecord(value) || value.version !== 2 || typeof value.locale !== "string" || normalizeLocale(value.locale) !== value.locale || !isHttpUrl(value.target) || typeof value.startedAt !== "string" || !isNumber(value.deadlineAt)) throw checkpointInvalid();
  const checkpointStartedAtMs = Date.parse(value.startedAt);
  if (!Number.isFinite(checkpointStartedAtMs) || value.deadlineAt < checkpointStartedAtMs || value.deadlineAt > checkpointStartedAtMs + SCAN_CONFIG.checkpointLifetimeMs) throw checkpointInvalid("The scan checkpoint lifetime is invalid or has expired its allowed horizon.");
  const crawl = value.crawl;
  if (!isRecord(crawl) || (crawl.phase !== "crawl" && crawl.phase !== "verify") || typeof crawl.robotsFetched !== "boolean") throw checkpointInvalid();
  const startOutcome = crawl.startOutcome;
  if (!isRecord(startOutcome) || !isHttpUrl(startOutcome.requestedUrl) || !isHttpUrl(startOutcome.finalUrl) || (typeof startOutcome.contentType !== "string" && startOutcome.contentType !== null) || typeof startOutcome.isHtml !== "boolean") throw checkpointInvalid();
  if (["status", "bytes", "durationMs"].some((k) => !isNumber(startOutcome[k])) || typeof startOutcome.truncated !== "boolean" || !isStringArray(startOutcome.redirectChain, 20)) throw checkpointInvalid();
  // A bodyText key is never valid checkpoint data, even if a caller tries to
  // smuggle one into an otherwise valid summary.
  if (Object.prototype.hasOwnProperty.call(crawl.startOutcome, "bodyText")) throw checkpointInvalid();
  const pageShape = (p: unknown): boolean => isRecord(p) && !Object.prototype.hasOwnProperty.call(p, "bodyText") && isHttpUrl(p.url) && isNumber(p.status) && isNumber(p.bytes) && isNumber(p.durationMs) && typeof p.truncated === "boolean" && (typeof p.title === "string" || p.title === null) && (typeof p.metaDescription === "string" || p.metaDescription === null) && typeof p.hasViewport === "boolean" && (typeof p.lang === "string" || p.lang === null) && isNumber(p.h1Count) && isStringArray(p.imagesMissingAlt, 1000) && isNumber(p.imagesTotal) && Array.isArray(p.links) && p.links.length <= SCAN_CONFIG.maxCheckpointItems && p.links.every((l) => isRecord(l) && typeof l.href === "string" && l.href.length <= 1000 && typeof l.text === "string" && l.text.length <= 500) && Array.isArray(p.forms) && p.forms.length <= SCAN_CONFIG.maxCheckpointItems && p.forms.every((f) => isRecord(f) && (typeof f.action === "string" || f.action === null) && typeof f.method === "string" && typeof f.hasPassword === "boolean" && typeof f.hasEmail === "boolean" && isStringArray(f.unlabelledFields, 1000)) && isStringArray(p.actionTexts, 1000);
  if (!Array.isArray(crawl.pages) || crawl.pages.length > SCAN_CONFIG.maxCheckpointItems || crawl.pages.some((p) => !pageShape(p))) throw checkpointInvalid();
  if (!Array.isArray(crawl.queue) || !Array.isArray(crawl.fetches) || !Array.isArray(crawl.referrers) || !Array.isArray(crawl.failures) || !Array.isArray(crawl.verifyQueue) || !isStringArray(crawl.visited, SCAN_CONFIG.maxCheckpointItems) || !isStringArray(crawl.discovered, SCAN_CONFIG.maxCheckpointItems) || !isStringArray(crawl.robotsSkipped, SCAN_CONFIG.maxCheckpointItems) || !isNumber(crawl.verifyIndex)) throw checkpointInvalid();
  const totalItems = crawl.pages.length + crawl.queue.length + crawl.visited.length + crawl.discovered.length + crawl.fetches.length + crawl.referrers.length + crawl.failures.length + crawl.verifyQueue.length + crawl.robotsSkipped.length;
  if (totalItems > SCAN_CONFIG.maxCheckpointItems) throw checkpointInvalid();
  if (!isRecord(value.limits) || !isNumber(value.limits.maxPages) || !Number.isInteger(value.limits.maxPages) || value.limits.maxPages < 1 || value.limits.maxPages > 2000 || !isNumber(value.limits.maxLinkChecks) || !Number.isInteger(value.limits.maxLinkChecks) || value.limits.maxLinkChecks < 0 || value.limits.maxLinkChecks > 5000 || !isNumber(value.limits.maxDepth) || !Number.isInteger(value.limits.maxDepth) || value.limits.maxDepth < 1 || value.limits.maxDepth > 5 || !isStringArray(value.auditTypes, 20)) throw checkpointInvalid();
  if (!Array.isArray(crawl.robots) || crawl.robots.length > SCAN_CONFIG.maxCheckpointItems || crawl.robots.some((r) => !isRecord(r) || !isStringArray(r.agents, 20) || !isStringArray(r.disallow, 1000) || !isStringArray(r.allow, 1000))) throw checkpointInvalid();
  const techCategories = new Set(["language", "runtime", "framework", "library", "css", "cms", "platform", "service", "build"]);
  if (crawl.tech !== undefined && (!Array.isArray(crawl.tech) || crawl.tech.length > 80 || crawl.tech.some((t) => !isRecord(t) || typeof t.name !== "string" || t.name.length < 1 || t.name.length > 100 || typeof t.category !== "string" || !techCategories.has(t.category) || typeof t.evidence !== "string" || t.evidence.length > 240 || (t.confidence !== "direct" && t.confidence !== "inferred")))) throw checkpointInvalid();
  const coverage = crawl.coverage;
  if (!isRecord(coverage) || !["pagesFetched", "pagesParsed", "linksDiscovered", "linksChecked", "linksUnchecked", "formDestinationsChecked", "skippedByRobots", "truncatedPages", "maxPages", "maxDepth"].every((k) => isNumber(coverage[k])) || typeof coverage.deadlineHit !== "boolean") throw checkpointInvalid();
  if (!Array.isArray(crawl.queue) || crawl.queue.some((q) => !isRecord(q) || !isHttpUrl(q.url) || !isNumber(q.depth) || !Number.isInteger(q.depth) || q.depth < 1 || q.depth > 5)) throw checkpointInvalid();
  if (crawl.verifyQueue.some((q) => !isRecord(q) || !isHttpUrl(q.url) || (q.kind !== "form-action" && q.kind !== "link-check"))) throw checkpointInvalid();
  if (!Number.isInteger(crawl.verifyIndex) || crawl.verifyIndex < 0 || crawl.verifyIndex > crawl.verifyQueue.length) throw checkpointInvalid();
  if (crawl.fetches.some((e) => !Array.isArray(e) || e.length !== 2 || !isHttpUrl(e[0]) || !isRecord(e[1]) || !isNumber(e[1].status) || !["page", "link-check", "form-action", "robots"].includes(e[1].kind as string))) throw checkpointInvalid();
  if (crawl.failures.some((f) => !isRecord(f) || !isHttpUrl(f.url) || typeof f.message !== "string" || f.message.length > 500)) throw checkpointInvalid();
  if (crawl.referrers.some((e) => !Array.isArray(e) || e.length !== 2 || !isHttpUrl(e[0]) || !Array.isArray(e[1]) || e[1].some((r) => !isRecord(r) || !isHttpUrl(r.from) || typeof r.anchorText !== "string" || r.anchorText.length > 500))) throw checkpointInvalid();
  const allowedOrigins = new Set([new URL(value.target).origin, new URL(startOutcome.finalUrl).origin]);
  const sameOrigin = (url: string) => allowedOrigins.has(new URL(url).origin);
  const allUrls = [...(crawl.queue as Array<{ url: string }>).map((q) => q.url), ...(crawl.visited as string[]), ...(crawl.discovered as string[]), ...(crawl.robotsSkipped as string[]), ...(crawl.fetches as Array<[string, unknown]>).map((e) => e[0]), ...(crawl.referrers as Array<[string, Array<{ from: string } >]>).map((e) => e[0]), ...(crawl.referrers as Array<[string, Array<{ from: string } >]>).flatMap((e) => e[1].map((r) => r.from)), ...(crawl.verifyQueue as Array<{ url: string }>).map((q) => q.url)];
  if (allUrls.some((url) => !sameOrigin(url))) throw checkpointInvalid("The checkpoint contains an out-of-scope URL.");
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > SCAN_CONFIG.maxCheckpointBytes) throw checkpointInvalid("The scan checkpoint is too large to resume safely.");
  // Return a JSON round-trip clone so callers cannot mutate untrusted input
  // after validation and so the result is demonstrably serializable.
  try { return JSON.parse(encoded) as ScanCheckpoint; } catch { throw checkpointInvalid(); }
}

export const parseScanCheckpoint = deserializeScanCheckpoint;
export function serializeScanCheckpoint(checkpoint: ScanCheckpoint): string {
  const parsed = deserializeScanCheckpoint(checkpoint);
  const encoded = JSON.stringify(parsed);
  if (encoded.length > SCAN_CONFIG.maxCheckpointBytes) throw checkpointInvalid("The scan checkpoint is too large to persist safely.");
  return encoded;
}

function reportFromSlice(rawTarget: string, startedAt: string, startedAtMs: number, crawl: Awaited<ReturnType<typeof crawlSiteSlice>>, auditTypes?: string[], now: () => number = Date.now): ScanReport {
  const pageSummaries = crawl.pages.map((p) => ({ url: p.url, status: p.status, bytes: p.bytes, durationMs: p.durationMs, title: p.title }));
  for (const f of crawl.failures) pageSummaries.push({ url: f.url, status: 0, bytes: 0, durationMs: 0, title: null });
  if (crawl.startOutcome.status < 200 || crawl.startOutcome.status >= 300) return emptyReport({ target: rawTarget, startedAt, finalUrl: crawl.startOutcome.finalUrl, durationMs: now() - startedAtMs, pages: pageSummaries, coverage: crawl.coverage, error: { code: "TARGET_ERROR_STATUS", message: `The page returned HTTP ${crawl.startOutcome.status}, so there's nothing to audit. If the site works in your browser, it may be blocking automated requests.` } });
  if (!crawl.startOutcome.isHtml) return emptyReport({ target: rawTarget, startedAt, finalUrl: crawl.startOutcome.finalUrl, durationMs: now() - startedAtMs, pages: pageSummaries, coverage: crawl.coverage, error: { code: "NOT_HTML", message: "That URL didn't return an HTML page, so it can't be audited as a web page." } });
  const findings = runRules({ pages: crawl.pages, fetches: crawl.fetches, referrers: crawl.referrers, startPageUrl: crawl.startOutcome.finalUrl, siteFiles: crawl.siteFiles }, auditTypes);
  const limitations = [...BASE_LIMITATIONS, `Only same-origin pages up to ${crawl.coverage.maxDepth} clicks from the submitted URL were checked (max ${crawl.coverage.maxPages} pages read in full).`];
  if (crawl.coverage.linksUnchecked > 0) limitations.push(`${crawl.coverage.linksUnchecked} discovered internal link(s) couldn't be verified within the scan limits, so broken-link coverage is partial.`);
  if (crawl.coverage.skippedByRobots > 0) limitations.push(`${crawl.coverage.skippedByRobots} URL(s) were skipped because the site's robots.txt disallows automated access to them.`);
  if (crawl.coverage.truncatedPages > 0) limitations.push(`${crawl.coverage.truncatedPages} page(s) exceeded the per-page size cap and were only partially inspected.`);
  if (crawl.coverage.deadlineHit) limitations.push("The scan hit its time limit before covering everything within the page limits — treat this as a partial audit.");
  return { status: crawl.coverage.deadlineHit ? "partial" : "completed", auditTypes: auditTypes?.length ? auditTypes : ["generic"], target: rawTarget, finalUrl: crawl.startOutcome.finalUrl, startedAt, durationMs: now() - startedAtMs, rulesetVersion: RULESET_VERSION, score: auditScore(findings), findings, tech: crawl.tech, pages: pageSummaries, coverage: crawl.coverage, limitations, error: null };
}

/** Execute one finite slice. Persist `checkpoint` only when status is paused. */
export async function runScanSlice(rawInput?: string, deps: ScanSliceDeps = {}): Promise<ScanSliceResult> {
  const supplied = deps.checkpoint === undefined ? undefined : deserializeScanCheckpoint(deps.checkpoint);
  const locale = supplied?.locale ?? normalizeLocale(deps.locale);
  const input = rawInput ?? supplied?.target;
  if (!input) throw checkpointInvalid("A target URL is required for the first scan slice.");
  const normalized = normalizeScanInput(input);
  const target = await assertPublicUrl(normalized, deps.resolver);
  if (supplied && supplied.target !== target.url.href) throw checkpointInvalid("The checkpoint target does not match the requested URL.");
  const now = deps.now ?? Date.now;
  const startedAt = supplied?.startedAt ?? new Date(now()).toISOString();
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) throw checkpointInvalid("The checkpoint start time is invalid.");
  const overallDeadlineAt = supplied?.deadlineAt ?? startedAtMs + SCAN_CONFIG.checkpointLifetimeMs;
  if (!Number.isFinite(overallDeadlineAt) || overallDeadlineAt < startedAtMs || overallDeadlineAt > startedAtMs + SCAN_CONFIG.checkpointLifetimeMs) throw checkpointInvalid();
  const sliceStartedAtMs = now();
  const sliceDeadlineAt = Math.min(sliceStartedAtMs + SCAN_CONFIG.deadlineMs, overallDeadlineAt);
  const sliceController = new AbortController();
  const sliceTimer = setTimeout(() => sliceController.abort(), Math.max(0, sliceDeadlineAt - sliceStartedAtMs));
  const signal = deps.signal ? AbortSignal.any([deps.signal, sliceController.signal]) : sliceController.signal;
  const fetchPage: FetchPageFn = (url, opts) => fetchPublic(url, { headersOnly: opts.headersOnly, allowNonHtmlBody: opts.allowNonHtmlBody, maxBytes: opts.maxBytes, signal: opts.signal, resolver: deps.resolver, transport: deps.transport, locale });
  try {
    const crawl = await crawlSiteSlice(target.url, { fetchPage, now: deps.now, deadlineAt: sliceDeadlineAt, overallDeadlineAt, signal, limits: deps.limits ?? supplied?.limits, checkpoint: supplied, workBudget: deps.workBudget ?? SCAN_CONFIG.sliceWorkBudget, auditTypes: deps.auditTypes, locale, sitemap: deps.sitemap, validateUrl: async (url) => { await assertPublicUrl(url, deps.resolver); } });
    if (!crawl.done) {
      const checkpoint = deserializeScanCheckpoint({ ...(crawl.checkpoint as ScanCheckpoint), auditTypes: deps.auditTypes?.length ? deps.auditTypes : supplied?.auditTypes ?? [] });
      return { status: "paused", done: false, report: null, checkpoint, checkpointJson: serializeScanCheckpoint(checkpoint) };
    }
    const report = reportFromSlice(target.url.href, startedAt, startedAtMs, crawl, deps.auditTypes?.length ? deps.auditTypes : supplied?.auditTypes, now);
    return { status: report.status, done: true, report, checkpoint: null, checkpointJson: null };
  } finally {
    clearTimeout(sliceTimer);
  }
}
