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

const BASE = (head: string, body: string) =>
  `<!doctype html><html lang="en"><head><title>Acme — Home</title>
   <meta name="description" content="Acme does things well.">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <link rel="icon" href="/favicon.ico">${head}</head><body>${body}</body></html>`;

const CLEAN = BASE("", `<h1>Welcome</h1><img src="/a.jpg" alt="Team" width="800" height="600">
  <a href="/x">Go</a><a href="https://other.example" target="_blank" rel="noopener">Ext</a>`);

const ids = (c: RuleContext) => runRules(c).map((f) => f.ruleId);

describe("ruleset version", () => {
  it("is 7.0.0", () => expect(RULESET_VERSION).toBe("7.0.0"));
  it("clean page yields none of the 1.2 rules", () => {
    const got = ids(ctx([{ url: "https://acme.example/", html: CLEAN }]));
    for (const id of ["CLY-070", "CLY-071", "CLY-072", "CLY-073", "CLY-074", "CLY-075", "CLY-076", "CLY-077"]) {
      expect(got).not.toContain(id);
    }
  });
});

describe("CLY-070 multiple H1", () => {
  it("fires for two H1s", () => {
    const html = BASE("", `<h1>One</h1><h1>Two</h1>`);
    expect(ids(ctx([{ url: "https://acme.example/", html }]))).toContain("CLY-070");
  });
});

describe("CLY-071 overlong title", () => {
  it("fires above 60 chars", () => {
    const long = "A".repeat(61);
    const html = CLEAN.replace("<title>Acme — Home</title>", `<title>${long}</title>`);
    expect(ids(ctx([{ url: "https://acme.example/", html }]))).toContain("CLY-071");
  });
});

describe("CLY-072 duplicate meta description", () => {
  it("fires when two pages share a description", () => {
    const a = BASE("", `<h1>A</h1>`);
    const b = BASE("", `<h1>B</h1>`);
    const got = ids(ctx([
      { url: "https://acme.example/", html: a },
      { url: "https://acme.example/about", html: b },
    ]));
    expect(got).toContain("CLY-072");
  });
});

describe("CLY-073 slow response (measured)", () => {
  it("fires above 2.5s with measured basis", () => {
    const f = runRules(ctx([{ url: "https://acme.example/", html: CLEAN, extra: { durationMs: 3100 } }]))
      .find((x) => x.ruleId === "CLY-073");
    expect(f).toBeTruthy();
    expect(f?.confidenceBasis).toBe("measured");
    expect(f?.evidence.join(" ")).toContain("3.1s");
  });
});

describe("CLY-074 images without dimensions", () => {
  it("fires when width/height are absent", () => {
    const html = BASE("", `<h1>x</h1><img src="/a.jpg" alt="Team">`);
    expect(ids(ctx([{ url: "https://acme.example/", html }]))).toContain("CLY-074");
  });
});

describe("CLY-075 mixed content", () => {
  it("fires for http subresources on an https page", () => {
    const html = BASE("", `<h1>x</h1><img src="http://cdn.example/a.jpg" alt="a" width="10" height="10">`);
    const f = runRules(ctx([{ url: "https://acme.example/", html }])).find((x) => x.ruleId === "CLY-075");
    expect(f?.severity).toBe("high");
  });
  it("does not fire on http pages", () => {
    const html = BASE("", `<h1>x</h1><img src="http://cdn.example/a.jpg" alt="a" width="10" height="10">`);
    expect(ids(ctx([{ url: "http://acme.example/", html }]))).not.toContain("CLY-075");
  });
});

describe("CLY-076 target=_blank without noopener", () => {
  it("fires when rel lacks noopener", () => {
    const html = BASE("", `<h1>x</h1><a href="https://other.example" target="_blank">Ext</a>`);
    expect(ids(ctx([{ url: "https://acme.example/", html }]))).toContain("CLY-076");
  });
});

describe("CLY-077 missing favicon (start page only)", () => {
  it("fires when the start page declares no icon", () => {
    const noIcon = CLEAN.replace(`<link rel="icon" href="/favicon.ico">`, "");
    expect(ids(ctx([{ url: "https://acme.example/", html: noIcon }]))).toContain("CLY-077");
  });
});
