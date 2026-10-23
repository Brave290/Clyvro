/**
 * Lab site scan — discover real pages, then probe them.
 * Sensitive-file baseline stays. Same-origin only. GET/HEAD, never OPTIONS,
 * never forms, never other hosts.
 */
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import type { Resolver } from "@/lib/scanner/ssrf";
import type { FetchOutcome } from "@/lib/scanner/types";
import { SENSITIVE_BASELINE_PATHS } from "@/lib/pentest/catalog";

export const LAB_SCAN_UA = "Clyvro-Lab/1.0 (+owner-verified)";
export const LAB_SCAN_MAX_URLS = 500;
export const LAB_SCAN_MAX_DEPTH = 3;
export const LAB_SCAN_CONCURRENCY = 5;
export const LAB_SCAN_TIMEOUT_MS = 10_000;
export const LAB_SCAN_BODY_CAP = 64_000;

const COMMON_ROUTES = [
  "/", "/about", "/pricing", "/contact", "/login", "/signup", "/dashboard",
  "/account", "/settings", "/admin", "/blog", "/faq", "/terms", "/privacy",
  "/checkout", "/cart", "/products", "/services", "/docs", "/api/health",
];

const SITEMAP_CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-0.xml"];

export type LabRowMark = "EXPOSED" | "FOUND" | "REDIRECT" | "MISSING" | "OTHER";

export interface LabScanRow {
  url: string;
  method: "HEAD" | "GET";
  status: number;
  content_type: string | null;
  content_length: number | null;
  redirect_to?: string;
  headers_subset: Record<string, string>;
  mark: LabRowMark;
  sensitive: boolean;
}

export interface LabScanReport {
  origin: string;
  pagesDiscovered: number;
  pagesScanned: number;
  sensitiveHits: number;
  stoppedOn: string | null;
  rows: LabScanRow[];
}

const HEADER_KEEP = ["content-type", "content-length", "location", "server", "x-powered-by", "cache-control", "x-robots-tag"];

function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
}

function normalizePageUrl(raw: string, origin: URL): string | null {
  try {
    const u = new URL(raw, origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname.replace(/^www\./, "") !== origin.hostname.replace(/^www\./, "")) return null;
    u.hash = "";
    if (u.pathname.length > 200) return null;
    if (u.pathname.includes("..") || u.pathname.includes("\\")) return null;
    const skip = /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|map|mp4|webm)$/i;
    if (skip.test(u.pathname)) return null;
    return u.origin + u.pathname + u.search;
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

function parseRobots(text: string): { sitemaps: string[]; disallows: string[] } {
  const sitemaps: string[] = [];
  const disallows: string[] = [];
  let applies = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    const key = (k ?? "").toLowerCase();
    if (key === "user-agent") applies = v === "*" || v.toLowerCase().includes("clyvro");
    else if (key === "sitemap") sitemaps.push(v);
    else if (key === "disallow" && applies && v) disallows.push(v);
  }
  return { sitemaps, disallows };
}

function blockedByRobots(pathname: string, disallows: string[]): boolean {
  return disallows.some((d) => d !== "/" && pathname.startsWith(d));
}

function extractHrefs(html: string, base: URL): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const n = normalizePageUrl(m[1], base);
    if (n) out.push(n);
  }
  return out;
}

function extractBuildId(html: string): string | null {
  const data = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  if (data?.[1]) return data[1];
  const src = html.match(/\/_next\/static\/([^/]+)\/(?:_buildManifest|_ssgManifest)\.js/);
  return src?.[1] ?? null;
}

function extractManifestRoutes(js: string): string[] {
  const out = new Set<string>();
  for (const m of js.matchAll(/["'](\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)["']/g)) {
    const p = m[1];
    if (p.startsWith("/_next")) continue;
    if (p.length > 180) continue;
    out.add(p.split("?")[0] ?? p);
  }
  const sorted = js.match(/sortedPages"\s*:\s*\[([^\]]+)\]/);
  if (sorted?.[1]) {
    for (const m of sorted[1].matchAll(/["']([^"']+)["']/g)) out.add(m[1]);
  }
  return [...out];
}

function subset(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of HEADER_KEEP) {
    const v = headers?.[k];
    if (v) out[k] = v;
  }
  return out;
}

function markFor(status: number, sensitive: boolean): LabRowMark {
  if (status >= 300 && status < 400) return "REDIRECT";
  if (status === 200 || (status >= 200 && status < 300)) return sensitive ? "EXPOSED" : "FOUND";
  if (status === 404 || status === 403) return "MISSING";
  return "OTHER";
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function runLabDiscoveryScan(
  originUrl: URL,
  deps: { transport?: Transport; resolver?: Resolver; now?: () => number } = {},
): Promise<LabScanReport> {
  const origin = new URL(originUrl.origin);
  const opts = {
    timeoutMs: LAB_SCAN_TIMEOUT_MS,
    transport: deps.transport,
    resolver: deps.resolver,
    userAgent: LAB_SCAN_UA,
    maxRedirects: 0,
    captureAllHeaders: true,
  };

  let stoppedOn: string | null = null;
  const sensitive = new Set(SENSITIVE_BASELINE_PATHS.map((p) => origin.origin + p));
  const discovered = new Set<string>([origin.origin + "/"]);
  const disallows: string[] = [];

  async function grab(path: string, extra: { allowBody?: boolean; maxBytes?: number } = {}): Promise<FetchOutcome | null> {
    try {
      return await fetchPublic(new URL(path, origin), {
        ...opts,
        method: "GET",
        allowNonHtmlBody: true,
        maxBytes: extra.maxBytes ?? 200_000,
        headersOnly: extra.allowBody === false,
      });
    } catch {
      return null;
    }
  }

  const home = await grab("/");
  if (home?.bodyText) {
    for (const href of extractHrefs(home.bodyText, origin)) discovered.add(href);
    const buildId = extractBuildId(home.bodyText);
    if (buildId) {
      for (const file of ["_buildManifest.js", "_ssgManifest.js"]) {
        const man = await grab(`/_next/static/${buildId}/${file}`, { maxBytes: 400_000 });
        if (man?.bodyText) {
          for (const route of extractManifestRoutes(man.bodyText)) {
            const n = normalizePageUrl(route, origin);
            if (n) discovered.add(n);
          }
        }
      }
    }
  }

  const robots = await grab("/robots.txt", { maxBytes: 60_000 });
  if (robots?.bodyText) {
    const parsed = parseRobots(robots.bodyText);
    disallows.push(...parsed.disallows);
    for (const sm of parsed.sitemaps) {
      const n = normalizePageUrl(sm, origin);
      if (n) {
        const xml = await grab(new URL(n).pathname + new URL(n).search, { maxBytes: 400_000 });
        if (xml?.bodyText) {
          for (const loc of extractLocs(xml.bodyText)) {
            const p = normalizePageUrl(loc, origin);
            if (p) discovered.add(p);
          }
        }
      }
    }
  }

  for (const path of SITEMAP_CANDIDATES) {
    const xml = await grab(path, { maxBytes: 400_000 });
    if (!xml?.bodyText) continue;
    const locs = extractLocs(xml.bodyText);
    const isIndex = /<sitemapindex/i.test(xml.bodyText);
    if (isIndex) {
      for (const loc of locs.slice(0, 5)) {
        const n = normalizePageUrl(loc, origin);
        if (!n) continue;
        const child = await grab(new URL(n).pathname, { maxBytes: 400_000 });
        if (child?.bodyText) {
          for (const l of extractLocs(child.bodyText)) {
            const p = normalizePageUrl(l, origin);
            if (p) discovered.add(p);
          }
        }
      }
    } else {
      for (const loc of locs) {
        const p = normalizePageUrl(loc, origin);
        if (p) discovered.add(p);
      }
    }
  }

  for (const route of COMMON_ROUTES) {
    const n = normalizePageUrl(route, origin);
    if (n) discovered.add(n);
  }

  const queue: { url: string; depth: number }[] = [{ url: origin.origin + "/", depth: 0 }];
  const crawled = new Set<string>();
  while (queue.length && crawled.size < LAB_SCAN_MAX_URLS) {
    const next = queue.shift();
    if (!next) break;
    if (crawled.has(next.url) || next.depth >= LAB_SCAN_MAX_DEPTH) continue;
    const path = new URL(next.url).pathname;
    if (blockedByRobots(path, disallows)) continue;
    crawled.add(next.url);
    const page = await grab(new URL(next.url).pathname + new URL(next.url).search, { maxBytes: 200_000 });
    if (!page?.bodyText) continue;
    for (const href of extractHrefs(page.bodyText, origin)) {
      if (discovered.size >= LAB_SCAN_MAX_URLS + sensitive.size) break;
      discovered.add(href);
      if (!crawled.has(href) && next.depth + 1 < LAB_SCAN_MAX_DEPTH) queue.push({ url: href, depth: next.depth + 1 });
    }
  }

  const pagesDiscovered = discovered.size;
  const toProbe = [...new Set([...sensitive, ...discovered])];

  const rows: LabScanRow[] = [];
  let cursor = 0;
  const stop = () => stoppedOn !== null;

  async function probeOne(target: string): Promise<LabScanRow | null> {
    if (stop()) return null;
    const isSensitive = sensitive.has(target);
    const url = new URL(target);
    const pathAndSearch = url.pathname + url.search;
    try {
      const head = isSensitive
        ? null
        : await fetchPublic(new URL(pathAndSearch, origin), {
            ...opts,
            method: "HEAD",
            headersOnly: true,
            allowNonHtmlBody: true,
          });
      if (head?.status === 429) {
        stoppedOn = "429";
        return null;
      }
      const retryAfter = head?.allHeaders?.["retry-after"] ?? head?.headers?.["retry-after"];
      if (retryAfter && !stop()) {
        const wait = Math.min(8_000, (Number(retryAfter) || 0) * 1000 || 0);
        if (wait > 0) await sleep(wait);
      }

      const needGet = isSensitive || (head != null && ((head.status >= 200 && head.status < 300) || head.status === 405 || head.status === 501));
      let get: FetchOutcome | null = null;
      if (needGet) {
        get = await fetchPublic(new URL(pathAndSearch, origin), {
          ...opts,
          method: "GET",
          allowNonHtmlBody: true,
          maxBytes: LAB_SCAN_BODY_CAP,
          headersOnly: false,
        });
        if (get.status === 429) {
          stoppedOn = "429";
          return null;
        }
      }
      const used = get ?? head;
      if (!used) return null;
      const headers = subset(used.allHeaders ?? used.headers);
      const location = headers.location;
      let redirect_to: string | undefined;
      if (location) {
        try {
          const dest = new URL(location, origin);
          if (sameOrigin(dest, origin)) redirect_to = dest.href;
          else redirect_to = dest.origin + " (off-site, not followed)";
        } catch { /* ignore */ }
      }
      const lengthHeader = headers["content-length"];
      const content_length = lengthHeader && /^\d+$/.test(lengthHeader)
        ? Number(lengthHeader)
        : (get?.bytes ?? null);
      return {
        url: target,
        method: get ? "GET" : "HEAD",
        status: used.status,
        content_type: used.contentType,
        content_length,
        ...(redirect_to ? { redirect_to } : {}),
        headers_subset: headers,
        mark: markFor(used.status, isSensitive),
        sensitive: isSensitive,
      };
    } catch {
      return {
        url: target,
        method: isSensitive ? "GET" : "HEAD",
        status: 0,
        content_type: null,
        content_length: null,
        headers_subset: {},
        mark: "OTHER",
        sensitive: isSensitive,
      };
    }
  }

  async function worker() {
    while (cursor < toProbe.length && !stop()) {
      const i = cursor;
      cursor += 1;
      const row = await probeOne(toProbe[i]!);
      if (row) rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(LAB_SCAN_CONCURRENCY, toProbe.length) }, () => worker()));

  const rank: Record<LabRowMark, number> = { EXPOSED: 0, FOUND: 1, REDIRECT: 2, OTHER: 3, MISSING: 4 };
  rows.sort((a, b) => rank[a.mark] - rank[b.mark] || a.url.localeCompare(b.url));

  return {
    origin: origin.origin,
    pagesDiscovered,
    pagesScanned: rows.length,
    sensitiveHits: rows.filter((r) => r.mark === "EXPOSED").length,
    stoppedOn,
    rows,
  };
}
