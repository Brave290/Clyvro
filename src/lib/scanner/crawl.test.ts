import { describe, it, expect } from "vitest";
import { crawlSite, crawlSiteSlice, normalizeInternalUrl, parseRobots, robotsAllows, type FetchPageFn } from "./crawl";
import { ScanError, type FetchOutcome } from "./types";

function page(url: string, html: string, status = 200): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 5, redirectChain: [],
  };
}

const html = (links: string[] = [], extra = "") =>
  `<html lang="en"><head><title>t</title></head><body>${links.map((l) => `<a href="${l}">x</a>`).join("")}${extra}</body></html>`;

/** In-memory site: / → /a,/b,external,missing,img.png ; /a → /deep1 ; /deep1 → /deep2 (too deep) ; form→/submit (404). */
const SITE: Record<string, FetchOutcome | "timeout"> = {
  "https://site.example/": page("https://site.example/", html(
    ["/a", "/b", "https://other.example/x", "/missing", "/img.png", "mailto:hi@x.example", "/a#section"],
    '<form action="/submit" method="post"><input type="text" aria-label="n"></form>',
  )),
  "https://site.example/a": page("https://site.example/a", html(["/deep1", "/"])),
  "https://site.example/b": page("https://site.example/b", html(["/missing"])),
  "https://site.example/deep1": page("https://site.example/deep1", html(["/deep2"])),
  "https://site.example/deep2": page("https://site.example/deep2", html([])),
  "https://site.example/missing": page("https://site.example/missing", "not found", 404),
  "https://site.example/submit": page("https://site.example/submit", "gone", 404),
  "https://site.example/robots.txt": page("https://site.example/robots.txt", "User-agent: *\nDisallow: /b\n", 200),
};

function makeFetcher(site: Record<string, FetchOutcome | "timeout">, calls: string[] = []): FetchPageFn {
  return async (url, opts) => {
    calls.push(url.href + (opts.headersOnly ? " [headers]" : ""));
    const hit = site[url.href];
    if (hit === "timeout") throw new ScanError("TIMEOUT", "timed out");
    if (!hit) return { ...page(url.href, "nf", 404), contentType: "text/html" };
    return opts.headersOnly ? { ...hit, bodyText: null } : hit;
  };
}

const farFuture = () => Date.now() + 60_000;

describe("normalizeInternalUrl", () => {
  const origin = "https://s.example";
  it("accepts same-origin pages, rejects the rest", () => {
    expect(normalizeInternalUrl("/about", "https://s.example/", origin)?.href).toBe("https://s.example/about");
    expect(normalizeInternalUrl("https://other.example/", "https://s.example/", origin)).toBeNull();
    expect(normalizeInternalUrl("mailto:a@b.example", "https://s.example/", origin)).toBeNull();
    expect(normalizeInternalUrl("/photo.jpg", "https://s.example/", origin)).toBeNull();
    expect(normalizeInternalUrl("#top", "https://s.example/", origin)).toBeNull();
    expect(normalizeInternalUrl("/p#frag", "https://s.example/", origin)?.href).toBe("https://s.example/p");
  });
});

describe("robots parsing", () => {
  it("respects Disallow, with longer Allow winning", () => {
    const g = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: googlebot\nDisallow: /");
    expect(robotsAllows(g, "/private/secret")).toBe(false);
    expect(robotsAllows(g, "/private/public/page")).toBe(true);
    expect(robotsAllows(g, "/open")).toBe(true); // googlebot group ignored
  });
});

describe("crawlSite bounds and coverage", () => {
  it("crawls same-origin pages to depth 2, skips robots-disallowed, verifies links and form destinations", async () => {
    const calls: string[] = [];
    const out = await crawlSite(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE, calls),
      deadlineAt: farFuture(),
    });
    const fetchedPaths = [...out.fetches.keys()].map((u) => new URL(u).pathname);
    expect(fetchedPaths).toContain("/a");
    expect(fetchedPaths).toContain("/deep1");       // depth 2 allowed
    // /deep2 is beyond crawl depth — never parsed as a page (a headers-only link check is fine)
    expect(out.pages.some((p) => p.url.endsWith("/deep2"))).toBe(false);
    if (out.fetches.has("https://site.example/deep2")) {
      expect(out.fetches.get("https://site.example/deep2")?.kind).toBe("link-check");
    }
    expect(fetchedPaths).not.toContain("/b");       // robots disallow
    expect(out.coverage.skippedByRobots).toBeGreaterThanOrEqual(1);
    // /missing was verified and 404s; referrer recorded from home
    expect(out.fetches.get("https://site.example/missing")?.status).toBe(404);
    expect(out.referrers.get("https://site.example/missing")?.length).toBeGreaterThan(0);
    // form destination checked as form-action
    expect(out.fetches.get("https://site.example/submit")).toMatchObject({ status: 404, kind: "form-action" });
    expect(out.coverage.formDestinationsChecked).toBe(1);
    // external + assets never fetched
    expect(calls.some((c) => c.includes("other.example"))).toBe(false);
    expect(calls.some((c) => c.includes("img.png"))).toBe(false);
    expect(out.coverage.deadlineHit).toBe(false);
  });

  it("respects the deadline and reports deadlineHit instead of running on", async () => {
    let tick = 0;
    const now = () => (tick += 1000); // each now() jumps 1s; deadline at 2.5s
    const out = await crawlSite(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE),
      deadlineAt: 2500,
      now,
    });
    expect(out.coverage.deadlineHit).toBe(true);
    expect(out.pages.length).toBeGreaterThanOrEqual(1); // start page still analyzed
  });

  it("records per-page failures and keeps crawling", async () => {
    const site = { ...SITE, "https://site.example/a": "timeout" as const };
    const withoutRobots = { ...site, "https://site.example/robots.txt": page("https://site.example/robots.txt", "", 404) };
    const out = await crawlSite(new URL("https://site.example/"), {
      fetchPage: makeFetcher(withoutRobots),
      deadlineAt: farFuture(),
    });
    expect(out.failures.some((f) => f.url.endsWith("/a"))).toBe(true);
    expect(out.pages.some((p) => p.url.endsWith("/b"))).toBe(true); // sibling still crawled
  });
});

describe("resumable crawl slices", () => {
  it("round-trips a bounded checkpoint and resumes to the same crawl result", async () => {
    const calls: string[] = [];
    const first = await crawlSiteSlice(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE, calls), deadlineAt: farFuture(), workBudget: 1,
    });
    expect(first.paused).toBe(true);
    expect(first.checkpoint).not.toBeNull();
    const json = JSON.stringify(first.checkpoint);
    expect(json).not.toContain("<html");
    expect(json.length).toBeLessThan(1_000_000);

    let next = await crawlSiteSlice(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE, calls), deadlineAt: farFuture(), workBudget: 3,
      checkpoint: JSON.parse(json),
    });
    while (!next.done) {
      next = await crawlSiteSlice(new URL("https://site.example/"), {
        fetchPage: makeFetcher(SITE, calls), deadlineAt: farFuture(), workBudget: 3,
        checkpoint: JSON.parse(JSON.stringify(next.checkpoint)),
      });
    }
    const full = await crawlSite(new URL("https://site.example/"), { fetchPage: makeFetcher(SITE), deadlineAt: farFuture() });
    expect(next.pages.map((p) => p.url)).toEqual(full.pages.map((p) => p.url));
    expect(next.coverage.pagesParsed).toBe(full.coverage.pagesParsed);
    expect(next.coverage.linksChecked).toBe(full.coverage.linksChecked);
  });

  it("does not exceed the per-slice operation budget and revalidates resumed URLs", async () => {
    const firstCalls: string[] = [];
    const first = await crawlSiteSlice(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE, firstCalls), deadlineAt: farFuture(), workBudget: 1,
    });
    const validations: string[] = [];
    const resumedCalls: string[] = [];
    const next = await crawlSiteSlice(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE, resumedCalls), deadlineAt: farFuture(), workBudget: 1,
      checkpoint: JSON.parse(JSON.stringify(first.checkpoint)),
      validateUrl: async (url) => { validations.push(url.href); },
    });
    expect(firstCalls.length).toBeLessThanOrEqual(1);
    expect(resumedCalls.length).toBeLessThanOrEqual(1);
    expect(validations).toContain("https://site.example/robots.txt");
    expect(next.paused).toBe(true);
  });

  it("marks a terminal deadline as partial work rather than a slice pause", async () => {
    const out = await crawlSiteSlice(new URL("https://site.example/"), {
      fetchPage: makeFetcher(SITE), deadlineAt: 0, now: () => 1, workBudget: 2,
    });
    expect(out.done).toBe(true);
    expect(out.terminalReason).toBe("deadline");
    expect(out.coverage.deadlineHit).toBe(true);
  });
});
