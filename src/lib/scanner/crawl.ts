import { parsePage } from "./parse";
import {
  ScanError,
  type Coverage,
  type FetchOutcome,
  type FetchOutcomeSummary,
  type FetchRecord,
  type ParsedPage,
  type Referrer,
  type ScanCheckpoint,
} from "./types";
import { SCAN_CONFIG } from "./config";

/**
 * Bounded same-origin crawler.
 *
 * Bounds (from SCAN_CONFIG): max pages, max depth 2, max verification
 * fetches, per-request timeout and byte cap (in the fetcher), and a hard
 * wall-clock deadline. Everything the crawl could not cover is counted in
 * Coverage and surfaced in the report — never silently skipped.
 *
 * Forms are never submitted. Form destinations are checked with a safe,
 * body-less GET and reported as observations with that caveat.
 */

export type FetchPageFn = (
  url: URL,
  opts: { headersOnly?: boolean; allowNonHtmlBody?: boolean; maxBytes?: number; signal?: AbortSignal },
) => Promise<FetchOutcome>;

export interface CrawlFailure {
  url: string;
  message: string;
}

export interface CrawlOutcome {
  startOutcome: FetchOutcome;
  pages: ParsedPage[];
  fetches: Map<string, FetchRecord>;
  referrers: Map<string, Referrer[]>;
  failures: CrawlFailure[];
  coverage: Coverage;
}

const SKIPPED_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|pdf|zip|tar|gz|rar|7z|mp4|webm|mp3|wav|ogg|css|js|mjs|map|json|xml|rss|atom|woff2?|ttf|eot|otf|docx?|xlsx?|pptx?|csv)$/i;

/** Resolve a raw href/action against a page URL; return it only if it is an in-scope http(s) page URL. */
export function normalizeInternalUrl(href: string, base: string, origin: string): URL | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== origin) return null;
  url.hash = "";
  if (SKIPPED_EXTENSIONS.test(url.pathname)) return null;
  if (url.href.length > 1000) return null;
  return url;
}

/* ---------------- robots.txt (minimal, prefix-based) ---------------- */

export interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (field === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && field === "disallow" && value) {
      current.disallow.push(value);
    } else if (current && field === "allow" && value) {
      current.allow.push(value);
    }
  }
  return groups;
}

export function robotsAllows(groups: RobotsGroup[], pathname: string): boolean {
  const applicable = groups.filter(
    (g) => g.agents.includes("*") || g.agents.some((a) => "clyvrobot".startsWith(a)),
  );
  let bestDisallow = -1;
  let bestAllow = -1;
  for (const g of applicable) {
    for (const d of g.disallow) if (pathname.startsWith(d)) bestDisallow = Math.max(bestDisallow, d.length);
    for (const a of g.allow) if (pathname.startsWith(a)) bestAllow = Math.max(bestAllow, a.length);
  }
  return bestAllow >= bestDisallow;
}

/* ---------------- crawl ---------------- */

export interface CrawlDeps {
  fetchPage: FetchPageFn;
  now?: () => number;
  deadlineAt: number;
  signal?: AbortSignal;
  /** Per-scan overrides (plan entitlements). Everything stays within hard safety ceilings. */
  limits?: { maxPages?: number; maxLinkChecks?: number; maxDepth?: number };
}

export async function crawlSite(startUrl: URL, deps: CrawlDeps): Promise<CrawlOutcome> {
  const cfg = {
    ...SCAN_CONFIG,
    maxPages: Math.min(2000, Math.max(1, deps.limits?.maxPages ?? SCAN_CONFIG.maxPages)),
    maxLinkChecks: Math.min(5000, Math.max(0, deps.limits?.maxLinkChecks ?? SCAN_CONFIG.maxLinkChecks)),
    maxDepth: Math.min(5, Math.max(1, deps.limits?.maxDepth ?? SCAN_CONFIG.maxDepth)),
  };
  const now = deps.now ?? Date.now;
  const pastDeadline = () => now() >= deps.deadlineAt;

  const fetches = new Map<string, FetchRecord>();
  const referrers = new Map<string, Referrer[]>();
  const pages: ParsedPage[] = [];
  const failures: CrawlFailure[] = [];
  const coverage: Coverage = {
    pagesFetched: 0,
    pagesParsed: 0,
    linksDiscovered: 0,
    linksChecked: 0,
    linksUnchecked: 0,
    formDestinationsChecked: 0,
    skippedByRobots: 0,
    truncatedPages: 0,
    maxPages: cfg.maxPages,
    maxDepth: cfg.maxDepth,
    deadlineHit: false,
  };

  // Start page — errors here abort the scan (handled by caller).
  const startOutcome = await deps.fetchPage(startUrl, { signal: deps.signal });
  const origin = new URL(startOutcome.finalUrl).origin;
  fetches.set(startOutcome.finalUrl, { status: startOutcome.status, kind: "page" });
  if (startOutcome.requestedUrl !== startOutcome.finalUrl) {
    fetches.set(startOutcome.requestedUrl, { status: startOutcome.status, kind: "page" });
  }

  const startIsParsable =
    startOutcome.status >= 200 && startOutcome.status < 300 && startOutcome.isHtml && startOutcome.bodyText !== null;
  if (!startIsParsable) {
    coverage.pagesFetched = 1;
    return { startOutcome, pages, fetches, referrers, failures, coverage };
  }

  // robots.txt for the final origin (best-effort: any failure = no restrictions).
  let robots: RobotsGroup[] = [];
  try {
    const r = await deps.fetchPage(new URL("/robots.txt", origin), { maxBytes: 100_000, allowNonHtmlBody: true, signal: deps.signal });
    fetches.set(new URL("/robots.txt", origin).href, { status: r.status, kind: "robots" });
    if (r.status >= 200 && r.status < 300 && r.bodyText) robots = parseRobots(r.bodyText);
  } catch { /* no robots restrictions */ }

  const robotsSkipped = new Set<string>();
  const noteRobotsSkip = (url: URL) => {
    if (!robotsSkipped.has(url.href)) {
      robotsSkipped.add(url.href);
      coverage.skippedByRobots++;
    }
  };

  const visited = new Set<string>([startOutcome.finalUrl]);
  const discovered = new Set<string>(); // unique internal targets seen in anchors
  const queue: { url: URL; depth: number }[] = [];

  const ingest = (page: ParsedPage, depth: number) => {
    for (const link of page.links) {
      const target = normalizeInternalUrl(link.href, page.url, origin);
      if (!target) continue;
      discovered.add(target.href);
      const refs = referrers.get(target.href) ?? [];
      if (!refs.some((r) => r.from === page.url && r.anchorText === link.text)) {
        refs.push({ from: page.url, anchorText: link.text });
        referrers.set(target.href, refs);
      }
      if (visited.has(target.href) || queue.some((q) => q.url.href === target.href)) continue;
      if (depth + 1 > cfg.maxDepth) continue;
      if (!robotsAllows(robots, target.pathname)) {
        noteRobotsSkip(target);
        continue;
      }
      queue.push({ url: target, depth: depth + 1 });
    }
  };

  const startPage = parsePage(startOutcome);
  pages.push(startPage);
  coverage.pagesFetched = 1;
  coverage.pagesParsed = 1;
  if (startOutcome.truncated) coverage.truncatedPages++;
  ingest(startPage, 0);

  // Breadth-first page crawl. Pages are fetched in small parallel
  // batches (SCAN_CONFIG.pageConcurrency) — the request count is
  // identical to a sequential crawl, only the wall-clock time shrinks.
  // Results are still ingested in queue order, so findings stay
  // deterministic.
  while (queue.length > 0 && coverage.pagesFetched < cfg.maxPages) {
    if (pastDeadline()) {
      coverage.deadlineHit = true;
      break;
    }
    const batch: { url: URL; depth: number }[] = [];
    while (batch.length < SCAN_CONFIG.pageConcurrency && queue.length > 0 && coverage.pagesFetched + batch.length < cfg.maxPages) {
      const item = queue.shift()!;
      if (visited.has(item.url.href)) continue;
      visited.add(item.url.href);
      batch.push(item);
    }
    if (batch.length === 0) break;
    const results = await Promise.all(batch.map(async (item) => {
      try {
        return { item, outcome: await deps.fetchPage(item.url, { signal: deps.signal }) as FetchOutcome | null, error: null as string | null };
      } catch (err) {
        return { item, outcome: null, error: err instanceof ScanError ? err.message : "Request failed" };
      }
    }));
    for (const { item, outcome, error } of results) {
      const url = item.url;
      if (!outcome) {
        failures.push({ url: url.href, message: error ?? "Request failed" });
        continue;
      }
      coverage.pagesFetched++;
      fetches.set(outcome.finalUrl, { status: outcome.status, kind: "page" });
      fetches.set(url.href, { status: outcome.status, kind: "page" });
      visited.add(outcome.finalUrl);
      if (outcome.status >= 200 && outcome.status < 300 && outcome.isHtml && outcome.bodyText !== null) {
        const parsed = parsePage(outcome);
        pages.push(parsed);
        coverage.pagesParsed++;
        if (outcome.truncated) coverage.truncatedPages++;
        ingest(parsed, item.depth);
      }
    }
  }

  // Verification pass: form destinations first (highest value), then the
  // most-linked unchecked internal URLs. Headers-only safe GETs.
  const formTargets = new Map<string, URL>();
  for (const p of pages) {
    for (const form of p.forms) {
      if (!form.action) continue;
      const t = normalizeInternalUrl(form.action, p.url, origin);
      if (t && !fetches.has(t.href)) formTargets.set(t.href, t);
    }
  }
  const linkTargets = [...discovered]
    .filter((u) => !fetches.has(u) && !visited.has(u) && !formTargets.has(u))
    .sort((a, b) => (referrers.get(b)?.length ?? 0) - (referrers.get(a)?.length ?? 0))
    .map((u) => new URL(u));

  const verifyQueue: { url: URL; kind: "form-action" | "link-check" }[] = [
    ...[...formTargets.values()].map((url) => ({ url, kind: "form-action" as const })),
    ...linkTargets.map((url) => ({ url, kind: "link-check" as const })),
  ].filter(({ url }) => {
    if (robotsAllows(robots, url.pathname)) return true;
    noteRobotsSkip(url);
    return false;
  });

  // Cap link-check volume deterministically by ordinal (workers race, counters don't).
  let linkOrdinal = 0;
  const cappedQueue = verifyQueue.filter((item) => item.kind === "form-action" || linkOrdinal++ < cfg.maxLinkChecks);

  let verifyIndex = 0;
  const verifyWorker = async () => {
    while (verifyIndex < cappedQueue.length) {
      if (pastDeadline()) {
        coverage.deadlineHit = true;
        return;
      }
      const item = cappedQueue[verifyIndex++];
      if (!item) return;
      try {
        const outcome = await deps.fetchPage(item.url, { headersOnly: true, signal: deps.signal });
        fetches.set(item.url.href, { status: outcome.status, kind: item.kind });
        if (item.kind === "form-action") coverage.formDestinationsChecked++;
        else coverage.linksChecked++;
      } catch (err) {
        failures.push({ url: item.url.href, message: err instanceof ScanError ? err.message : "Request failed" });
      }
    }
  };
  await Promise.all([verifyWorker(), verifyWorker(), verifyWorker()]);

  coverage.linksDiscovered = discovered.size;
  const checkedLinks = new Set(
    [...fetches.entries()].filter(([, r]) => r.kind !== "robots").map(([u]) => u),
  );
  coverage.linksUnchecked = [...discovered].filter((u) => !checkedLinks.has(u) && !visited.has(u)).length;

  return { startOutcome, pages, fetches, referrers, failures, coverage };
}

export interface CrawlSliceDeps extends CrawlDeps {
  checkpoint?: ScanCheckpoint;
  workBudget: number;
  /** Absolute hard expiry for the whole checkpoint lifetime. */
  overallDeadlineAt?: number;
  auditTypes?: string[];
  /** Revalidate persisted/discovered URLs before a socket-capable fetch. */
  validateUrl?: (url: URL) => Promise<void>;
  locale?: string;
  /** Deep scans: also enumerate routes from /sitemap.xml (owner-consented full-site coverage). */
  sitemap?: boolean;
}

export interface CrawlSliceOutcome {
  done: boolean;
  paused: boolean;
  terminalReason: "completed" | "deadline" | "limits" | null;
  checkpoint: ScanCheckpoint | null;
  startOutcome: FetchOutcome;
  pages: ParsedPage[];
  fetches: Map<string, FetchRecord>;
  referrers: Map<string, Referrer[]>;
  failures: CrawlFailure[];
  coverage: Coverage;
}

type SliceState = ScanCheckpoint["crawl"];

const asSummary = (outcome: FetchOutcome): FetchOutcomeSummary => ({
  requestedUrl: outcome.requestedUrl,
  finalUrl: outcome.finalUrl,
  status: outcome.status,
  contentType: outcome.contentType,
  isHtml: outcome.isHtml,
  bytes: outcome.bytes,
  truncated: outcome.truncated,
  durationMs: outcome.durationMs,
  redirectChain: [...outcome.redirectChain],
});

const fromSummary = (summary: FetchOutcomeSummary): FetchOutcome => ({ ...summary, bodyText: null });

function initialSliceState(startOutcome: FetchOutcome, limits: { maxPages: number; maxLinkChecks: number; maxDepth: number }): SliceState {
  return {
    phase: "crawl", robotsFetched: false, sitemapSeeded: false, robots: [], startOutcome: asSummary(startOutcome), pages: [], queue: [],
    visited: [startOutcome.finalUrl], discovered: [], fetches: [], referrers: [], failures: [],
    coverage: { pagesFetched: 0, pagesParsed: 0, linksDiscovered: 0, linksChecked: 0, linksUnchecked: 0,
      formDestinationsChecked: 0, skippedByRobots: 0, truncatedPages: 0, maxPages: limits.maxPages,
      maxDepth: limits.maxDepth, deadlineHit: false },
    robotsSkipped: [], verifyQueue: [], verifyIndex: 0,
  };
}

function mapFromEntries<T>(entries: [string, T][]): Map<string, T> {
  return new Map(entries.map(([key, value]) => [key, value]));
}
function entriesFromMap<T>(map: Map<string, T>): [string, T][] { return [...map.entries()]; }

function makeCheckpoint(target: URL, startedAt: string, overallDeadlineAt: number, limits: { maxPages: number; maxLinkChecks: number; maxDepth: number }, auditTypes: string[], locale: string, state: SliceState): ScanCheckpoint {
  return {
    version: 2, locale, target: target.href, startedAt, deadlineAt: overallDeadlineAt, limits, auditTypes: [...auditTypes],
    crawl: {
      ...state,
      pages: state.pages.map((p) => ({ ...p, links: p.links.map((l) => ({ ...l })), forms: p.forms.map((f) => ({ ...f, unlabelledFields: [...f.unlabelledFields] })), imagesMissingAlt: [...p.imagesMissingAlt], actionTexts: [...p.actionTexts] })),
      queue: state.queue.map((q) => ({ ...q })), visited: [...state.visited], discovered: [...state.discovered],
      fetches: state.fetches.map(([url, record]) => [url, { ...record }]),
      referrers: state.referrers.map(([url, refs]) => [url, refs.map((r) => ({ ...r }))]),
      failures: state.failures.map((f) => ({ ...f })), coverage: { ...state.coverage },
      robots: state.robots.map((r) => ({ agents: [...r.agents], disallow: [...r.disallow], allow: [...r.allow] })),
      robotsSkipped: [...state.robotsSkipped], verifyQueue: state.verifyQueue.map((q) => ({ ...q })),
    },
  };
}

/** Run a finite number of fetch/check operations and return resumable progress when the budget is exhausted. */
export async function crawlSiteSlice(startUrl: URL, deps: CrawlSliceDeps): Promise<CrawlSliceOutcome> {
  const cfg = {
    ...SCAN_CONFIG,
    maxPages: Math.min(2000, Math.max(1, deps.limits?.maxPages ?? deps.checkpoint?.limits.maxPages ?? SCAN_CONFIG.maxPages)),
    maxLinkChecks: Math.min(5000, Math.max(0, deps.limits?.maxLinkChecks ?? deps.checkpoint?.limits.maxLinkChecks ?? SCAN_CONFIG.maxLinkChecks)),
    maxDepth: Math.min(5, Math.max(1, deps.limits?.maxDepth ?? deps.checkpoint?.limits.maxDepth ?? SCAN_CONFIG.maxDepth)),
  };
  const limits = { maxPages: cfg.maxPages, maxLinkChecks: cfg.maxLinkChecks, maxDepth: cfg.maxDepth };
  const now = deps.now ?? Date.now;
  const budget = Math.max(1, Math.min(SCAN_CONFIG.sliceWorkBudget * 10, Math.floor(deps.workBudget)));
  let used = 0;
  const overallDeadlineAt = deps.overallDeadlineAt ?? deps.deadlineAt;
  const pastDeadline = () => now() >= deps.deadlineAt || !!deps.signal?.aborted;
  const pastOverallDeadline = () => now() >= overallDeadlineAt;
  const target = new URL(startUrl.href);
  let state: SliceState;
  let startedAt = new Date(now()).toISOString();

  if (deps.checkpoint) {
    state = deps.checkpoint.crawl;
    startedAt = deps.checkpoint.startedAt;
  } else {
    const startOutcome = await deps.fetchPage(target, { signal: deps.signal });
    state = initialSliceState(startOutcome, limits);
    state.fetches.push([startOutcome.finalUrl, { status: startOutcome.status, kind: "page" }]);
    if (startOutcome.requestedUrl !== startOutcome.finalUrl) state.fetches.push([startOutcome.requestedUrl, { status: startOutcome.status, kind: "page" }]);
    state.coverage.pagesFetched = 1;
    used++;
    if (startOutcome.status >= 200 && startOutcome.status < 300 && startOutcome.isHtml && startOutcome.bodyText !== null) {
      const startPage = parsePage(startOutcome);
      state.pages.push(startPage); state.coverage.pagesParsed = 1;
      if (startOutcome.truncated) state.coverage.truncatedPages++;
      const origin = new URL(startOutcome.finalUrl).origin;
      const refs = mapFromEntries(state.referrers); const discovered = new Set<string>();
      for (const link of startPage.links) {
        const url = normalizeInternalUrl(link.href, startPage.url, origin); if (!url) continue;
        discovered.add(url.href);
        const existing = refs.get(url.href) ?? [];
        if (!existing.some((r) => r.from === startPage.url && r.anchorText === link.text)) existing.push({ from: startPage.url, anchorText: link.text });
        refs.set(url.href, existing);
        if (!state.queue.some((q) => q.url === url.href) && 1 <= cfg.maxDepth) state.queue.push({ url: url.href, depth: 1 });
      }
      state.discovered = [...discovered]; state.referrers = entriesFromMap(refs);
    }
  }

  const origin = new URL(state.startOutcome.finalUrl).origin;
  const fetches = mapFromEntries(state.fetches); const referrers = mapFromEntries(state.referrers);
  const visited = new Set(state.visited); const discovered = new Set(state.discovered); const robotsSkipped = new Set(state.robotsSkipped);
  const noteRobotsSkip = (url: URL) => { if (!robotsSkipped.has(url.href)) { robotsSkipped.add(url.href); state.coverage.skippedByRobots++; } };
  const validateAndFetch = async (url: URL, opts: Parameters<FetchPageFn>[1]) => {
    if (deps.validateUrl) await deps.validateUrl(url);
    return deps.fetchPage(url, opts);
  };

  if (state.pages.length === 0) { state.phase = "verify"; state.robotsFetched = true; }
  if (state.phase === "crawl" && !state.robotsFetched && used < budget && !pastDeadline()) {
    try {
      const robotsUrl = new URL("/robots.txt", origin);
      const r = await validateAndFetch(robotsUrl, { maxBytes: 100_000, allowNonHtmlBody: true, signal: deps.signal });
      fetches.set(robotsUrl.href, { status: r.status, kind: "robots" });
      if (r.status >= 200 && r.status < 300 && r.bodyText) state.robots = parseRobots(r.bodyText);
    } catch { /* robots failure is permissive */ }
    state.robotsFetched = true; used++;
  }
  // Deep scans: enumerate routes from /sitemap.xml so pages with no inbound
  // links are still covered. One bounded pass (index → up to 3 children),
  // same-origin only, robots filtering applies to the queue below as usual.
  if (deps.sitemap && state.phase === "crawl" && state.robotsFetched && !state.sitemapSeeded && used < budget && !pastDeadline()) {
    state.sitemapSeeded = true;
    const locsOf = (xml: string): string[] => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const fetchSitemap = async (url: URL): Promise<string | null> => {
      try {
        const r = await validateAndFetch(url, { maxBytes: 1_000_000, allowNonHtmlBody: true, signal: deps.signal });
        fetches.set(url.href, { status: r.status, kind: "robots" });
        used++;
        return r.status >= 200 && r.status < 300 ? r.bodyText : null;
      } catch { used++; return null; }
    };
    const rootXml = await fetchSitemap(new URL("/sitemap.xml", origin));
    if (rootXml) {
      let locs = locsOf(rootXml);
      if (/<sitemapindex/i.test(rootXml)) {
        locs = [];
        for (const child of locsOf(rootXml).slice(0, 3)) {
          if (used >= budget || pastDeadline()) break;
          const childUrl = normalizeInternalUrl(child, state.startOutcome.finalUrl, origin);
          if (!childUrl) continue;
          const childXml = await fetchSitemap(childUrl);
          if (childXml) locs.push(...locsOf(childXml));
        }
      }
      for (const loc of locs) {
        if (state.queue.length >= cfg.maxPages) break;
        const url = normalizeInternalUrl(loc, state.startOutcome.finalUrl, origin);
        if (!url || visited.has(url.href) || state.queue.some((q) => q.url === url.href)) continue;
        discovered.add(url.href);
        state.queue.push({ url: url.href, depth: 1 });
      }
      state.discovered = [...discovered];
    }
  }
  const robots = state.robots;
  const queue = state.queue.map((q) => ({ ...q }));
  if (state.robotsFetched) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const queued = queue[i];
      if (queued && !robotsAllows(robots, new URL(queued.url).pathname)) {
        noteRobotsSkip(new URL(queued.url));
        queue.splice(i, 1);
      }
    }
  }
  const ingest = (page: ParsedPage, depth: number) => {
    for (const link of page.links) {
      const targetUrl = normalizeInternalUrl(link.href, page.url, origin); if (!targetUrl) continue;
      discovered.add(targetUrl.href);
      const refs = referrers.get(targetUrl.href) ?? [];
      if (!refs.some((r) => r.from === page.url && r.anchorText === link.text)) refs.push({ from: page.url, anchorText: link.text });
      referrers.set(targetUrl.href, refs);
      if (visited.has(targetUrl.href) || queue.some((q) => q.url === targetUrl.href) || depth + 1 > cfg.maxDepth) continue;
      if (!robotsAllows(robots, targetUrl.pathname)) { noteRobotsSkip(targetUrl); continue; }
      queue.push({ url: targetUrl.href, depth: depth + 1 });
    }
  };

  while (state.phase === "crawl" && queue.length > 0 && state.coverage.pagesFetched < cfg.maxPages) {
    if (pastDeadline()) { if (pastOverallDeadline()) state.coverage.deadlineHit = true; break; }
    if (used >= budget) break;
    // Parallel batch (same request count as sequential, far less wall
    // time); outcomes are ingested in queue order for determinism.
    const batch: { url: string; depth: number }[] = [];
    while (batch.length < SCAN_CONFIG.pageConcurrency && queue.length > 0 && used + batch.length < budget && state.coverage.pagesFetched + batch.length < cfg.maxPages) {
      const item = queue.shift()!;
      if (visited.has(item.url)) continue;
      visited.add(item.url);
      batch.push(item);
    }
    if (batch.length === 0) break;
    const results = await Promise.all(batch.map(async (item) => {
      try {
        return { item, outcome: await validateAndFetch(new URL(item.url), { signal: deps.signal }) as FetchOutcome | null, error: null as string | null };
      } catch (err) {
        return { item, outcome: null, error: err instanceof ScanError ? err.message : "Request failed" };
      }
    }));
    for (const { item, outcome, error } of results) {
      const url = new URL(item.url);
      used++;
      if (!outcome) { state.failures.push({ url: url.href, message: error ?? "Request failed" }); continue; }
      state.coverage.pagesFetched++;
      fetches.set(outcome.finalUrl, { status: outcome.status, kind: "page" }); fetches.set(url.href, { status: outcome.status, kind: "page" }); visited.add(outcome.finalUrl);
      if (outcome.status >= 200 && outcome.status < 300 && outcome.isHtml && outcome.bodyText !== null) {
        const parsed = parsePage(outcome); state.pages.push(parsed); state.coverage.pagesParsed++;
        if (outcome.truncated) state.coverage.truncatedPages++; ingest(parsed, item.depth);
      }
    }
  }
  state.queue = queue; state.visited = [...visited]; state.discovered = [...discovered]; state.fetches = entriesFromMap(fetches); state.referrers = entriesFromMap(referrers); state.robotsSkipped = [...robotsSkipped];

  if (state.phase === "crawl" && (state.coverage.deadlineHit || queue.length === 0 || state.coverage.pagesFetched >= cfg.maxPages)) {
    const formTargets = new Map<string, URL>();
    for (const p of state.pages) for (const form of p.forms) {
      if (!form.action) continue; const t = normalizeInternalUrl(form.action, p.url, origin);
      if (t && !fetches.has(t.href)) formTargets.set(t.href, t);
    }
    const linkTargets = [...discovered].filter((u) => !fetches.has(u) && !visited.has(u) && !formTargets.has(u))
      .sort((a, b) => (referrers.get(b)?.length ?? 0) - (referrers.get(a)?.length ?? 0)).slice(0, cfg.maxLinkChecks)
      .map((url) => ({ url, kind: "link-check" as const }));
    state.verifyQueue = [...[...formTargets.values()].map((url) => ({ url: url.href, kind: "form-action" as const })), ...linkTargets].filter((item) => {
      const url = new URL(item.url); if (robotsAllows(robots, url.pathname)) return true; noteRobotsSkip(url); return false;
    });
    state.verifyIndex = 0; state.phase = "verify";
  }

  while (state.phase === "verify" && state.verifyIndex < state.verifyQueue.length) {
    if (pastDeadline()) { if (pastOverallDeadline()) state.coverage.deadlineHit = true; break; }
    if (used >= budget) break;
    const batch = state.verifyQueue.slice(state.verifyIndex, state.verifyIndex + Math.min(SCAN_CONFIG.pageConcurrency, budget - used));
    if (batch.length === 0) break;
    state.verifyIndex += batch.length;
    const results = await Promise.all(batch.map(async (item) => {
      try {
        return { item, outcome: await validateAndFetch(new URL(item.url), { headersOnly: true, signal: deps.signal }) as FetchOutcome | null, error: null as string | null };
      } catch (err) {
        return { item, outcome: null, error: err instanceof ScanError ? err.message : "Request failed" };
      }
    }));
    for (const { item, outcome, error } of results) {
      used++;
      if (!outcome) { state.failures.push({ url: item.url, message: error ?? "Request failed" }); continue; }
      fetches.set(item.url, { status: outcome.status, kind: item.kind });
      if (item.kind === "form-action") state.coverage.formDestinationsChecked++; else state.coverage.linksChecked++;
    }
  }
  state.coverage.linksDiscovered = discovered.size;
  const checkedLinks = new Set([...fetches.entries()].filter(([, r]) => r.kind !== "robots").map(([u]) => u));
  state.coverage.linksUnchecked = [...discovered].filter((u) => !checkedLinks.has(u) && !visited.has(u)).length;
  state.fetches = entriesFromMap(fetches); state.referrers = entriesFromMap(referrers); state.robotsSkipped = [...robotsSkipped];
  const terminal = state.coverage.deadlineHit ? "deadline" : state.phase === "verify" && state.verifyIndex >= state.verifyQueue.length ? "completed" : null;
  const done = terminal !== null; const checkpoint = done ? null : makeCheckpoint(target, startedAt, overallDeadlineAt, limits, [], deps.locale ?? "en", state);
  return { done, paused: !done, terminalReason: terminal, checkpoint, startOutcome: fromSummary(state.startOutcome), pages: state.pages, fetches, referrers, failures: state.failures, coverage: state.coverage };
}
