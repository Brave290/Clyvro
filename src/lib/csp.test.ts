import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, firebaseAuthDomainSource, generateNonce } from "@/lib/csp";
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

  describe("Google sign-in (Firebase Auth popup) is admitted explicitly", () => {
    const directive = (csp: string, name: string) =>
      csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

    it("script-src admits Google's gapi loader, which the Firebase SDK injects without a nonce", () => {
      const scriptSrc = directive(buildContentSecurityPolicy("n"), "script-src")!;
      expect(scriptSrc.split(/\s+/)).toContain("https://apis.google.com");
      // Still nonce-strict: no 'unsafe-inline', no 'strict-dynamic' escape hatch, no bare https:.
      expect(scriptSrc).not.toMatch(/unsafe-inline|strict-dynamic|\shttps:(\s|$)/);
    });

    it("frame-src exists (no longer inherits default-src 'self') and names the auth iframe + Google accounts", () => {
      const frameSrc = directive(buildContentSecurityPolicy("n"), "frame-src");
      expect(frameSrc).toBeDefined();
      const sources = frameSrc!.split(/\s+/).slice(1);
      expect(sources).toEqual(expect.arrayContaining(["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"]));
      expect(sources).not.toContain("*");
      expect(sources).not.toContain("https:");
    });

    it("script-src and frame-src admit Flutterwave Inline (in-app checkout modal)", () => {
      const csp = buildContentSecurityPolicy("n");
      const scriptSrc = directive(csp, "script-src")!;
      const frameSrc = directive(csp, "frame-src")!;
      expect(scriptSrc.split(/\s+/)).toContain("https://checkout.flutterwave.com");
      expect(frameSrc.split(/\s+/)).toEqual(expect.arrayContaining(["https://checkout.flutterwave.com", "https://*.flutterwave.com"]));
    });

    it("a custom NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN joins frame-src; defaults and junk never do", () => {
      // Custom hosting domain → added.
      expect(firebaseAuthDomainSource("auth.clyvro.app")).toBe("https://auth.clyvro.app");
      expect(firebaseAuthDomainSource("  Auth.Clyvro.App ")).toBe("https://auth.clyvro.app");
      const custom = directive(buildContentSecurityPolicy("n", false, { firebaseAuthDomain: "auth.clyvro.app" }), "frame-src")!;
      expect(custom.split(/\s+/)).toContain("https://auth.clyvro.app");

      // Already covered by the wildcard / exact defaults → nothing duplicated.
      expect(firebaseAuthDomainSource("clyvro-prod.firebaseapp.com")).toBeNull();
      expect(firebaseAuthDomainSource("accounts.google.com")).toBeNull();
      expect(firebaseAuthDomainSource(undefined)).toBeNull();
      expect(firebaseAuthDomainSource("")).toBeNull();
      const plain = buildContentSecurityPolicy("n");
      expect(buildContentSecurityPolicy("n", false, { firebaseAuthDomain: "clyvro-prod.firebaseapp.com" })).toBe(plain);

      // Env text is never interpolated raw: no scheme, path, port, quotes,
      // wildcards or directive injection — the policy is byte-identical.
      for (const junk of [
        "https://evil.example",
        "evil.example/path",
        "evil.example:8443",
        "evil.example; script-src *",
        "'unsafe-inline'",
        "localhost",
        "*.evil.example",
        "-bad.example",
      ]) {
        expect(firebaseAuthDomainSource(junk), junk).toBeNull();
        expect(buildContentSecurityPolicy("n", false, { firebaseAuthDomain: junk }), junk).toBe(plain);
      }
    });
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
      // Widest policy we ever serve: Google sign-in sources + a custom auth domain.
      "content-security-policy": buildContentSecurityPolicy("dogfood-nonce", false, { firebaseAuthDomain: "auth.clyvro.app" }),
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
