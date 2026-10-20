import { describe, it, expect } from "vitest";
import { parsePage } from "./parse";
import { runRules, type RuleContext } from "./rules";
import type { FetchOutcome, FetchRecord, Referrer } from "./types";
import { RULESET_VERSION } from "./config";

function outcome(url: string, html: string, status = 200): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 10, redirectChain: [],
  };
}

function ctx(htmlByUrl: Record<string, string>, extra: Partial<RuleContext> = {}): RuleContext {
  const pages = Object.entries(htmlByUrl).map(([url, html]) => parsePage(outcome(url, html)));
  return {
    pages,
    fetches: new Map<string, FetchRecord>(),
    referrers: new Map<string, Referrer[]>(),
    startPageUrl: Object.keys(htmlByUrl)[0],
    ...extra,
  };
}

const GOOD_PAGE = `<!doctype html><html lang="en"><head>
  <title>Acme Plumbing — Home</title>
  <meta name="description" content="Fast, reliable plumbers.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="/favicon.ico">
</head><body>
  <h1>Plumbers in Austin</h1>
  <img src="/team.jpg" alt="Our team" width="800" height="600"> <img src="/deco.png" alt="" width="100" height="100">
  <a href="/contact">Book a visit</a>
  <form action="/send" method="post"><label for="em">Email</label><input id="em" type="email"></form>
</body></html>`;

describe("a healthy page produces no findings", () => {
  it("clean fixture → zero findings (decorative alt='' and labelled input respected)", () => {
    expect(runRules(ctx({ "https://acme.example/": GOOD_PAGE }))).toEqual([]);
  });
});

describe("title / meta / structure rules", () => {
  it("flags missing title, description, viewport, lang, h1", () => {
    const bare = `<html><head></head><body><p>Hello</p><a href="/x">Contact us</a></body></html>`;
    const ids = runRules(ctx({ "https://acme.example/": bare })).map((f) => f.ruleId);
    expect(ids).toContain("CLY-001");
    expect(ids).toContain("CLY-003");
    expect(ids).toContain("CLY-050");
    expect(ids).toContain("CLY-060");
    expect(ids).toContain("CLY-061");
  });

  it("aggregates duplicates across pages with evidence", () => {
    const p = (t: string) => `<html lang="en"><head><title>${t}</title><meta name="description" content="d"><meta name="viewport" content="x"></head><body><h1>x</h1><a href="/">Contact</a></body></html>`;
    const findings = runRules(ctx({
      "https://a.example/": p("Same Title"),
      "https://a.example/about": p("Same Title"),
    }));
    const dupe = findings.find((f) => f.ruleId === "CLY-002");
    expect(dupe).toBeDefined();
    expect(dupe!.evidence.join(" ")).toContain("Same Title");
    expect(dupe!.confidenceBasis).toBe("confirmed");
  });
});

describe("alt text and form labels", () => {
  it("counts only images with NO alt attribute", () => {
    const html = GOOD_PAGE.replace(
      '<img src="/team.jpg" alt="Our team" width="800" height="600">',
      '<img src="/team.jpg" width="800" height="600"><img src="/van.jpg" width="800" height="600">',
    );
    const f = runRules(ctx({ "https://acme.example/": html })).find((x) => x.ruleId === "CLY-031");
    expect(f?.title).toContain("2 images");
  });

  it("detects placeholder-only fields but accepts for/id, wrapped and aria labels", () => {
    const html = `<html lang="en"><head><title>t</title><meta name="description" content="d"><meta name="viewport" content="x"></head><body><h1>x</h1>
      <form action="/go">
        <input id="a" type="text" placeholder="Name">
        <label>Wrapped <input type="text"></label>
        <input type="text" aria-label="Phone">
        <label for="b">B</label><input id="b" type="text">
        <input type="hidden" name="h"><input type="submit" value="Send">
      </form><a href="/c">Contact</a></body></html>`;
    const f = runRules(ctx({ "https://acme.example/": html })).find((x) => x.ruleId === "CLY-018");
    expect(f).toBeDefined();
    expect(f!.evidence.join(" ")).toContain("#a");
    expect(f!.evidence.join(" ")).not.toContain("#b");
  });
});

describe("broken links and form destinations", () => {
  it("reports a 404 internal link with its referrer and anchor text", () => {
    const pages = ctx({ "https://acme.example/": GOOD_PAGE });
    const fetches = new Map<string, FetchRecord>([
      ["https://acme.example/old-page", { status: 404, kind: "link-check" }],
    ]);
    const referrers = new Map<string, Referrer[]>([
      ["https://acme.example/old-page", [{ from: "https://acme.example/", anchorText: "Old services" }]],
    ]);
    const f = runRules({ ...pages, fetches, referrers }).find((x) => x.ruleId === "CLY-023");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
    expect(f!.evidence.join(" ")).toContain("HTTP 404");
    expect(f!.evidence.join(" ")).toContain("Old services");
  });

  it("does not invent broken links for unverified URLs", () => {
    const base = ctx({ "https://acme.example/": GOOD_PAGE });
    expect(runRules(base).some((f) => f.ruleId === "CLY-023")).toBe(false);
  });

  it("flags a form whose destination 404s on GET, with the no-submit caveat for POST forms", () => {
    const base = ctx({ "https://acme.example/": GOOD_PAGE });
    const fetches = new Map<string, FetchRecord>([
      ["https://acme.example/send", { status: 404, kind: "form-action" }],
    ]);
    const f = runRules({ ...base, fetches }).find((x) => x.ruleId === "CLY-041");
    expect(f).toBeDefined();
    expect(f!.explanation).toMatch(/never submit|safe GET/i);
    expect(f!.impactRationale).toMatch(/verify/i);
    // And it must NOT also appear as a plain broken link.
    expect(runRules({ ...base, fetches }).some((x) => x.ruleId === "CLY-023")).toBe(false);
  });
});

describe("heuristics are labelled as heuristics", () => {
  const NO_CTA = `<html lang="en"><head><title>t</title><meta name="description" content="d"><meta name="viewport" content="x"></head><body><h1>Welcome</h1><a href="/about">About our story</a></body></html>`;
  it("flags a CTA-less landing page as heuristic, not confirmed", () => {
    const f = runRules(ctx({ "https://acme.example/": NO_CTA })).find((x) => x.ruleId === "CLY-007");
    expect(f).toBeDefined();
    expect(f!.confidenceBasis).toBe("heuristic");
    expect(f!.impactRationale).toMatch(/heuristic/i);
  });
  it("stays silent when a CTA or a form exists", () => {
    expect(runRules(ctx({ "https://acme.example/": GOOD_PAGE })).some((f) => f.ruleId === "CLY-007")).toBe(false);
  });
});

describe("security rule", () => {
  it("flags a password form submitted over http", () => {
    const html = `<html lang="en"><head><title>t</title><meta name="description" content="d"><meta name="viewport" content="x"></head><body><h1>Login</h1>
      <form action="http://acme.example/login" method="post"><label for="pw">Password</label><input id="pw" type="password"></form></body></html>`;
    const f = runRules(ctx({ "https://acme.example/login": html })).find((x) => x.ruleId === "CLY-051");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
  });
});

describe("every finding satisfies the data contract", () => {
  it("rule id, version, evidence, recommendation all present", () => {
    const bare = `<html><head></head><body><img src="/x.png"><form action="/gone"><input type="text"></form></body></html>`;
    const fetches = new Map<string, FetchRecord>([["https://a.example/gone", { status: 410, kind: "form-action" }]]);
    for (const f of runRules({ ...ctx({ "https://a.example/": bare }), fetches })) {
      expect(f.ruleId).toMatch(/^CLY-\d{3}$/);
      expect(f.ruleVersion).toBe(RULESET_VERSION);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendation.length).toBeGreaterThan(10);
      expect(f.explanation.length).toBeGreaterThan(20);
    }
  });
});
