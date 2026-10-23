import { describe, it, expect } from "vitest";
import { parsePage } from "./parse";
import { runRules, type RuleContext } from "./rules";
import { RULESET_VERSION } from "./config";
import type { FetchOutcome, FetchRecord, Referrer } from "./types";

function outcome(url: string, html: string, extra: Partial<FetchOutcome> = {}): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 10, redirectChain: [],
    ...extra,
  };
}

function ctx(pages: { url: string; html: string; extra?: Partial<FetchOutcome> }[]): RuleContext {
  return {
    pages: pages.map((p) => parsePage(outcome(p.url, p.html, p.extra))),
    fetches: new Map<string, FetchRecord>(),
    referrers: new Map<string, Referrer[]>(),
    startPageUrl: pages[0].url,
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

describe("ruleset 7.0", () => {
  it("stamps 7.0.0", () => expect(RULESET_VERSION).toBe("7.0.0"));

  it("CLY-121 fires when X-Content-Type-Options is missing", () => {
    const got = ids(ctx([{
      url: "https://acme.example/",
      html: page(HEAD, BODY),
      extra: { headers: { "strict-transport-security": "max-age=31536000" } },
    }]));
    expect(got).toContain("CLY-121");
  });

  it("CLY-121 stays silent when nosniff is set", () => {
    const got = ids(ctx([{
      url: "https://acme.example/",
      html: page(HEAD, BODY),
      extra: { headers: { "x-content-type-options": "nosniff" } },
    }]));
    expect(got).not.toContain("CLY-121");
  });

  it("CLY-121 fires when the header is present but not nosniff", () => {
    const got = ids(ctx([{
      url: "https://acme.example/",
      html: page(HEAD, BODY),
      extra: { headers: { "x-content-type-options": "none" } },
    }]));
    expect(got).toContain("CLY-121");
  });

  it("CLY-122 fires on an HTTP homepage", () => {
    const got = ids(ctx([{ url: "http://acme.example/", html: page(HEAD, BODY) }]));
    expect(got).toContain("CLY-122");
  });

  it("CLY-122 stays silent on HTTPS", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, BODY) }]));
    expect(got).not.toContain("CLY-122");
  });

  it("CLY-123 fires when the body was truncated", () => {
    const got = ids(ctx([{
      url: "https://acme.example/",
      html: page(HEAD, BODY),
      extra: { truncated: true, bytes: 1_500_000 },
    }]));
    expect(got).toContain("CLY-123");
  });

  it("CLY-123 stays silent when the body was fully read", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, BODY) }]));
    expect(got).not.toContain("CLY-123");
  });
});
