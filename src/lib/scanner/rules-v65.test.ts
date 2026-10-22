import { describe, it, expect } from "vitest";
import { parsePage } from "./parse";
import { runRules, type RuleContext } from "./rules";
import type { FetchOutcome, FetchRecord, Referrer } from "./types";

function outcome(url: string, html: string, extra: Partial<FetchOutcome> = {}): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 10, redirectChain: [],
    ...extra,
  };
}

function ctx(pages: { url: string; html: string; extra?: Partial<FetchOutcome> }[], extra: Partial<RuleContext> = {}): RuleContext {
  return {
    pages: pages.map((p) => parsePage(outcome(p.url, p.html, p.extra))),
    fetches: extra.fetches ?? new Map<string, FetchRecord>(),
    referrers: extra.referrers ?? new Map<string, Referrer[]>(),
    startPageUrl: pages[0].url,
    siteFiles: extra.siteFiles,
  };
}

const HEAD = `<title>Acme — Home</title>
<meta name="description" content="A specific description of this bakery.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico"><link rel="canonical" href="https://acme.example/">
<meta property="og:title" content="Acme"><meta property="og:description" content="Desc">
<meta property="og:image" content="https://acme.example/og.jpg">`;
const WORDS = Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ");
const page = (head: string, body: string) =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;
const BODY = `<h1>Welcome</h1><p>${WORDS}</p><img src="/a.jpg" alt="The bakery storefront" width="800" height="600">
  <a href="/menu">See this week's menu</a>`;

const ids = (c: RuleContext) => runRules(c).map((f) => f.ruleId);

describe("ruleset 6.5 — stubs now fire", () => {
  it("CLY-107 fires when robots.txt disallows the homepage", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, BODY) }], {
      siteFiles: { securityTxt: 200, llmsTxt: 200, robotsTxt: 200, robotsDisallowsHome: true, sitemap: 200 },
    }));
    expect(got).toContain("CLY-107");
  });

  it("CLY-108 fires when /sitemap.xml is missing", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, BODY) }], {
      siteFiles: { securityTxt: 200, llmsTxt: 200, sitemap: 404 },
    }));
    expect(got).toContain("CLY-108");
  });

  it("CLY-108 stays silent when the sitemap probe never ran", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, BODY) }]));
    expect(got).not.toContain("CLY-108");
  });

  it("CLY-110 fires when the homepage has no og:image", () => {
    const head = HEAD.replace(`<meta property="og:image" content="https://acme.example/og.jpg">`, "");
    expect(ids(ctx([{ url: "https://acme.example/", html: page(head, BODY) }]))).toContain("CLY-110");
  });

  it("CLY-114 fires for session cookies missing flags", () => {
    const got = ids(ctx([{
      url: "https://acme.example/",
      html: page(HEAD, BODY),
      extra: { cookieFlags: [{ name: "sessionid", secure: false, httpOnly: false, sameSite: null }] },
    }]));
    expect(got).toContain("CLY-114");
  });

  it("CLY-118 fires for filename / generic alt text", () => {
    const html = page(HEAD, `<h1>Hi</h1><p>${WORDS}</p><img src="/x.jpg" alt="IMG_0042.jpg" width="800" height="600">`);
    expect(ids(ctx([{ url: "https://acme.example/", html }]))).toContain("CLY-118");
  });

  it("CLY-120 fires on redirect chains of 2+ hops", () => {
    const fetches = new Map<string, FetchRecord>([
      ["https://acme.example/", { status: 200, kind: "page", redirectChain: ["https://acme.example/old", "https://acme.example/"] }],
    ]);
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, BODY) }], { fetches }));
    expect(got).toContain("CLY-120");
  });
});
