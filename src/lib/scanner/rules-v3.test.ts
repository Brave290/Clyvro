import { describe, it, expect } from "vitest";
import { parsePage } from "./parse";
import { runRules, type RuleContext } from "./rules";
import type { FetchOutcome, FetchRecord, Referrer } from "./types";

function outcome(url: string, html: string): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 10, redirectChain: [],
  };
}

function ctx(pages: { url: string; html: string }[]): RuleContext {
  return {
    pages: pages.map((p) => parsePage(outcome(p.url, p.html))),
    fetches: new Map<string, FetchRecord>(),
    referrers: new Map<string, Referrer[]>(),
    startPageUrl: pages[0].url,
  };
}

const WORDS = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
const HEAD = (extra = "") =>
  `<title>Acme — Specific page</title><meta name="description" content="A specific description.">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <link rel="icon" href="/favicon.ico"><link rel="canonical" href="https://acme.example/">
   <meta property="og:title" content="Acme"><meta property="og:description" content="Desc">
   <meta property="og:image" content="/og.jpg">${extra}`;
const page = (head: string, body: string) =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;
const CLEAN = page(HEAD(), `<h1>Welcome</h1><h2>Details</h2><p>${WORDS}</p><a href="/pricing">See pricing plans</a>`);

const ids = (c: RuleContext) => runRules(c).map((f) => f.ruleId);

describe("ruleset 3.0", () => {
  it("a complete page triggers none of the 3.0 rules", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: CLEAN }]));
    for (const id of ["CLY-080", "CLY-081", "CLY-082", "CLY-083", "CLY-084", "CLY-085"]) {
      expect(got).not.toContain(id);
    }
  });

  it("flags missing canonical, OG basics, heading skips, thin content, generator and generic links", () => {
    const html = page(
      `<title>Acme</title><meta name="generator" content="WordPress 6.4.2">`,
      `<h1>Hi</h1><h3>Skipped</h3><p>tiny</p><a href="/x">click here</a>`,
    );
    const got = ids(ctx([{ url: "https://acme.example/", html }]));
    for (const id of ["CLY-080", "CLY-081", "CLY-082", "CLY-083", "CLY-084", "CLY-085"]) {
      expect(got).toContain(id);
    }
  });

  it("3.0 rules carry evidence and the 3.0.0 version stamp", () => {
    const html = page(`<title>Acme</title>`, `<h1>Hi</h1>`);
    const findings = runRules(ctx([{ url: "https://acme.example/", html }]));
    const canonical = findings.find((f) => f.ruleId === "CLY-080");
    expect(canonical?.ruleVersion).toBe("5.0.0");
    expect(canonical?.evidence.length).toBeGreaterThan(0);
  });

  it("duplicate titles respect canonicals (v3 false-positive guard)", () => {
    const dupeHead = (canonical: string) =>
      `<title>Same Title</title><meta name="description" content="d"><meta name="viewport" content="width=device-width">
       <link rel="icon" href="/f.ico"><link rel="canonical" href="${canonical}">
       <meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="/i.jpg">`;
    const body = `<h1>Page</h1><p>${WORDS}</p>`;
    // /copy canonicalises to / — its duplicate title is intentional, no CLY-002.
    const guarded = ids(ctx([
      { url: "https://acme.example/", html: page(dupeHead("https://acme.example/"), body) },
      { url: "https://acme.example/copy", html: page(dupeHead("https://acme.example/"), body) },
    ]));
    expect(guarded).not.toContain("CLY-002");
    // Two self-canonical pages sharing a title are still flagged.
    const flagged = ids(ctx([
      { url: "https://acme.example/a", html: page(dupeHead("https://acme.example/a"), body) },
      { url: "https://acme.example/b", html: page(dupeHead("https://acme.example/b"), body) },
    ]));
    expect(flagged).toContain("CLY-002");
  });

  it("respects audit-type filtering for the new rules", () => {
    const html = page(`<title>Acme</title><meta name="generator" content="WordPress 6.4.2">`, `<h1>Hi</h1><h3>Skip</h3>`);
    const c = ctx([{ url: "https://acme.example/", html }]);
    const securityOnly = runRules(c, ["security-config"]).map((f) => f.ruleId);
    expect(securityOnly).toContain("CLY-084");
    expect(securityOnly).not.toContain("CLY-082");
    const a11yOnly = runRules(c, ["accessibility"]).map((f) => f.ruleId);
    expect(a11yOnly).toContain("CLY-082");
    expect(a11yOnly).not.toContain("CLY-084");
  });
});
