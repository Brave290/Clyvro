import { describe, it, expect } from "vitest";
import { parsePage } from "./parse";
import { runRules, type RuleContext } from "./rules";
import type { FetchOutcome, FetchRecord, Referrer } from "./types";

function outcome(url: string, html: string, headers?: Record<string, string>): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 10, redirectChain: [], headers,
  };
}

function ctx(pages: { url: string; html: string; headers?: Record<string, string> }[]): RuleContext {
  return {
    pages: pages.map((p) => parsePage(outcome(p.url, p.html, p.headers))),
    fetches: new Map<string, FetchRecord>(),
    referrers: new Map<string, Referrer[]>(),
    startPageUrl: pages[0].url,
  };
}

const WORDS = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
const HEAD = `<title>Acme Bakery — Fresh bread in Lagos</title>
<meta name="description" content="A specific description of this specific page for searchers.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico"><link rel="canonical" href="https://acme.example/">
<meta property="og:title" content="Acme"><meta property="og:description" content="Desc">
<meta property="og:image" content="https://acme.example/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"Acme"}</script>`;
const page = (head: string, body: string) =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

const CLEAN_BODY = `<h1>Welcome to Acme</h1><h2>Today</h2><p>${WORDS}</p>
<a href="/pricing">See bread prices</a>
<form action="/order" method="post">
  <label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email">
</form>
<iframe src="/map" title="Map and directions"></iframe>`;

const SECURE_HEADERS = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const ids = (c: RuleContext) => runRules(c).map((f) => f.ruleId);
const NEW_IDS = ["CLY-086", "CLY-087", "CLY-088", "CLY-089", "CLY-090", "CLY-091", "CLY-092",
  "CLY-093", "CLY-094", "CLY-095", "CLY-096", "CLY-097", "CLY-098", "CLY-099", "CLY-100", "CLY-101", "CLY-102"];

describe("ruleset 5.0", () => {
  it("a complete, secure page triggers none of the 5.0 rules", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, CLEAN_BODY), headers: SECURE_HEADERS }]));
    for (const id of NEW_IDS) expect(got).not.toContain(id);
  });

  it("duplicate ids: referenced ones are the medium finding, plain ones the low", () => {
    const html = page(HEAD, `<h1>Hi</h1><p>${WORDS}</p>
      <label for="dup">Name</label><input id="dup" name="a"><input id="dup" name="b">
      <span id="plain"></span><span id="plain"></span>`);
    const got = ids(ctx([{ url: "https://acme.example/", html }]));
    expect(got).toContain("CLY-086");
    expect(got).toContain("CLY-087");
  });

  it("flags broken ARIA/label references, empty headings, untitled iframes, blocked zoom", () => {
    const html = page(
      `<title>Acme</title><meta name="viewport" content="width=device-width, user-scalable=no">`,
      `<h1>Hi</h1><h2></h2><p>${WORDS}</p>
       <button aria-controls="missing-panel">Open</button>
       <iframe src="/video"></iframe>`,
    );
    const got = ids(ctx([{ url: "https://acme.example/", html }]));
    for (const id of ["CLY-088", "CLY-089", "CLY-090", "CLY-091"]) expect(got).toContain(id);
  });

  it("flags placeholder-only labels, missing autocomplete and nameless fields", () => {
    const html = page(HEAD, `<h1>Hi</h1><p>${WORDS}</p>
      <form action="/x" method="post">
        <input type="email" name="email" placeholder="Your email">
        <input type="text" placeholder="City">
      </form>`);
    const got = ids(ctx([{ url: "https://acme.example/", html }]));
    for (const id of ["CLY-092", "CLY-093", "CLY-094"]) expect(got).toContain(id);
  });

  it("flags same-text-different-target links and text-less links", () => {
    const html = page(HEAD, `<h1>Hi</h1><p>${WORDS}</p>
      <a href="/website-prices">See prices</a> <a href="/print-prices">See prices</a>
      <a href="/social"><img src="/icon.png" alt=""></a>`);
    const got = ids(ctx([{ url: "https://acme.example/", html }]));
    expect(got).toContain("CLY-095");
    expect(got).toContain("CLY-096");
  });

  it("flags invalid JSON-LD, double canonical, meta refresh, hreflang and relative og:image", () => {
    const head = `<title>Acme</title>
      <link rel="canonical" href="https://acme.example/">
      <link rel="canonical" href="https://acme.example/">
      <meta property="og:image" content="/og.jpg">
      <link rel="alternate" hreflang="fr" href="https://acme.example/fr">
      <meta http-equiv="refresh" content="5; url=/new">
      <script type="application/ld+json">{"@type":"Bakery",}</script>`;
    const got = ids(ctx([{ url: "https://acme.example/", html: page(head, `<h1>Hi</h1><p>${WORDS}</p>`) }]));
    for (const id of ["CLY-097", "CLY-098", "CLY-100", "CLY-101", "CLY-102"]) expect(got).toContain(id);
  });

  it("security headers: missing set flagged on the HTTPS home page; skipped without header data", () => {
    const withHeaders = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, CLEAN_BODY), headers: { server: "nginx" } }]));
    expect(withHeaders).toContain("CLY-099");
    const finding = runRules(ctx([{ url: "https://acme.example/", html: page(HEAD, CLEAN_BODY), headers: {} }]))
      .find((f) => f.ruleId === "CLY-099");
    expect(finding?.evidence.length).toBe(4);
    // Rendered pages (flow scan) carry no headers → rule stays silent.
    const noHeaders = ids(ctx([{ url: "https://acme.example/", html: page(HEAD, CLEAN_BODY) }]));
    expect(noHeaders).not.toContain("CLY-099");
  });

  it("every 5.x finding carries the 5.1.0 version stamp", () => {
    const html = page(`<title>Acme</title><meta name="viewport" content="user-scalable=no">`, `<h1>Hi</h1><h2></h2>`);
    const findings = runRules(ctx([{ url: "https://acme.example/", html }]));
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.ruleVersion).toBe("6.5.0");
  });
});

describe("ruleset 5.1 discovery files", () => {
  const base = { url: "https://acme.example/", html: page(HEAD, CLEAN_BODY), headers: SECURE_HEADERS };
  const withFiles = (siteFiles?: { securityTxt: number | null; llmsTxt: number | null }) => {
    const c = ctx([base]);
    if (siteFiles) c.siteFiles = siteFiles;
    return ids(c);
  };

  it("missing files fire CLY-103 and CLY-104", () => {
    const got = withFiles({ securityTxt: 404, llmsTxt: 404 });
    expect(got).toContain("CLY-103");
    expect(got).toContain("CLY-104");
  });

  it("present files stay silent", () => {
    const got = withFiles({ securityTxt: 200, llmsTxt: 200 });
    expect(got).not.toContain("CLY-103");
    expect(got).not.toContain("CLY-104");
  });

  it("no probe (undefined) or failed probe (null) stays silent — never guess", () => {
    expect(withFiles(undefined)).not.toContain("CLY-103");
    expect(withFiles({ securityTxt: null, llmsTxt: null })).not.toContain("CLY-104");
  });
});

describe("ruleset 5.2 vulnerability checks", () => {
  const base = { url: "https://acme.example/", html: page(HEAD, CLEAN_BODY), headers: SECURE_HEADERS };
  const withHeaders = (headers: Record<string, string>) => ids(ctx([{ ...base, headers }]));

  it("CLY-105 fires on 'unsafe-inline' script CSP, stays silent on a strict CSP", () => {
    expect(withHeaders({ ...SECURE_HEADERS, "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'" })).toContain("CLY-105");
    expect(withHeaders({ ...SECURE_HEADERS, "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-abc123'" })).not.toContain("CLY-105");
    expect(withHeaders({ ...SECURE_HEADERS, "content-security-policy": "default-src * 'unsafe-eval'" })).toContain("CLY-105");
  });

  it("CLY-105 stays silent when no CSP exists at all (weak ≠ missing)", () => {
    expect(withHeaders(SECURE_HEADERS)).not.toContain("CLY-105");
  });

  it("CLY-106 fires only on reachable sensitive files from deep probes", () => {
    const c = ctx([base]);
    c.siteFiles = { securityTxt: 200, llmsTxt: 200, sensitive: [{ path: "/.env", status: 200 }, { path: "/.git/config", status: 404 }] };
    expect(ids(c)).toContain("CLY-106");
    const c2 = ctx([base]);
    c2.siteFiles = { securityTxt: 200, llmsTxt: 200, sensitive: [{ path: "/.env", status: 404 }, { path: "/.git/config", status: null }] };
    expect(ids(c2)).not.toContain("CLY-106");
    expect(ids(ctx([base]))).not.toContain("CLY-106");
  });
});
