import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";
import { parsePage } from "@/lib/scanner/parse";
import { runRules, type RuleContext } from "@/lib/scanner/rules";
import type { FetchOutcome } from "@/lib/scanner/types";

describe("our own Content-Security-Policy (dogfooding CLY-105)", () => {
  it("nonces are fresh, base64, and unpredictable per call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(a.length).toBeGreaterThanOrEqual(22);
  });

  it("production policy has no 'unsafe-inline'/'unsafe-eval' in script-src", () => {
    const csp = buildContentSecurityPolicy("test-nonce");
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("'nonce-test-nonce'");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("dev policy adds 'unsafe-eval' only (HMR), never 'unsafe-inline'", () => {
    const csp = buildContentSecurityPolicy("n", true);
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("Clyvro's scanner raises neither CLY-099 nor CLY-105 against our own headers", () => {
    // Mirror of what production serves: next.config static headers +
    // the middleware CSP. If this ever fails, our own site regressed.
    const headers = {
      "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "content-security-policy": buildContentSecurityPolicy("dogfood-nonce"),
    };
    const html = `<!doctype html><html lang="en"><head><title>Clyvro</title>
      <meta name="description" content="Evidence-first website audits and fixes.">
      <meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><h1>Find the friction</h1><p>${"real words ".repeat(60)}</p></body></html>`;
    const outcome: FetchOutcome = {
      requestedUrl: "https://clyvro.vercel.app/", finalUrl: "https://clyvro.vercel.app/",
      status: 200, contentType: "text/html", isHtml: true, bodyText: html,
      bytes: html.length, truncated: false, durationMs: 10, redirectChain: [], headers,
    };
    const ctx: RuleContext = {
      pages: [parsePage(outcome)],
      fetches: new Map(),
      referrers: new Map(),
      startPageUrl: "https://clyvro.vercel.app/",
    };
    const ids = runRules(ctx).map((f) => f.ruleId);
    expect(ids).not.toContain("CLY-099");
    expect(ids).not.toContain("CLY-105");
  });
});
