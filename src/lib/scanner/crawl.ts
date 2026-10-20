import { parsePage } from "./parse";
import { ScanError, type Coverage, type FetchOutcome, type FetchRecord, type ParsedPage, type Referrer } from "./types";
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

interface RobotsGroup {
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
}

export async function crawlSite(startUrl: URL, deps: CrawlDeps): Promise<CrawlOutcome> {
  const cfg = SCAN_CONFIG;
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

  // Breadth-first page crawl.
  while (queue.length > 0 && coverage.pagesFetched < cfg.maxPages) {
    if (pastDeadline()) {
      coverage.deadlineHit = true;
      break;
    }
    const { url, depth } = queue.shift()!;
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    let outcome: FetchOutcome;
    try {
      outcome = await deps.fetchPage(url, { signal: deps.signal });
    } catch (err) {
      failures.push({ url: url.href, message: err instanceof ScanError ? err.message : "Request failed" });
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
      ingest(parsed, depth);
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
