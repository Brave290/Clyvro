import { describe, expect, it } from "vitest";
import { runHackProtectionEngine } from "@/lib/services/hack-protection";
import { runSeoVisibilityEngine } from "@/lib/services/seo-visibility";

/**
 * Offline engine tests: a fake transport serves a fixed site so the
 * Hack Protection and SEO Visibility checks run deterministically.
 * github.com is only the (public) hostname — no network is touched
 * because every fetch goes through the fake transport; DNS for it is
 * the same pattern the readiness tests already rely on.
 */

const HARDENED_HTML = `<!doctype html><html lang="en"><head>
<title>Example Co — Websites that convert</title>
<meta name="description" content="Example Co builds fast, accessible websites for small teams that want more enquiries without paid ads." />
<link rel="canonical" href="https://github.com/" />
<meta property="og:title" content="Example Co" />
<meta property="og:image" content="https://github.com/og.png" />
<script type="application/ld+json">{"@type":"Organization","name":"Example Co"}</script>
</head><body><h1>Websites that convert</h1></body></html>`;

function fakeTransport(site: { html: string; headers?: Record<string, string>; exposedEnv?: boolean; robots?: string; sitemap?: string }) {
  return async (target: { url: URL }) => {
    const path = target.url.pathname;
    const isRobots = path === "/robots.txt";
    const isSitemap = path === "/sitemap.xml";
    const isSensitive = ["/.env", "/.git/HEAD", "/.git/config", "/wp-config.php.bak", "/server-status", "/.DS_Store"].includes(path);
    const isEnv = path === "/.env";
    const bodyText = isRobots
      ? (site.robots ?? "User-agent: *\nAllow: /\nSitemap: https://github.com/sitemap.xml\n")
      : isSitemap
        ? (site.sitemap ?? `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://github.com/</loc></url></urlset>`)
        : site.html;
    const headers: Record<string, string> = {
      "content-type": isRobots || isSitemap ? "text/plain" : "text/html; charset=utf-8",
      ...(site.headers ?? {}),
    };
    return {
      status: isSensitive ? (isEnv && site.exposedEnv ? 200 : 404) : 200,
      header: (n: string) => headers[n.toLowerCase()] ?? null,
      body: (async function* () { yield new TextEncoder().encode(bodyText); })(),
      cancelBody: async () => undefined,
    };
  };
}

const fakeResolver = async () => [{ address: "93.184.216.34", family: 4 }];

const HARDENED_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

describe("Hack Protection engine", () => {
  it("passes a hardened site and probes sensitive paths", async () => {
    const report = await runHackProtectionEngine("github.com", {
      transport: fakeTransport({ html: HARDENED_HTML, headers: HARDENED_HEADERS }) as never, resolver: fakeResolver as never,
    });
    expect(report.summary.fail).toBe(0);
    expect(report.checks.find((c) => c.id === "hsts")?.status).toBe("pass");
    expect(report.checks.find((c) => c.id === "exposed-files")?.status).toBe("pass");
    expect(report.probedPaths).toHaveLength(6);
  });

  it("fails loudly when .env is public and headers are missing", async () => {
    const report = await runHackProtectionEngine("github.com", {
      transport: fakeTransport({ html: "<html><body>hi</body></html>", exposedEnv: true }) as never, resolver: fakeResolver as never,
    });
    expect(report.checks.find((c) => c.id === "exposed-files")?.status).toBe("fail");
    expect(report.checks.find((c) => c.id === "csp")?.status).toBe("warn");
    expect(report.checks.find((c) => c.id === "csp")?.fix?.length).toBeGreaterThan(0);
  });
});

describe("SEO Visibility engine", () => {
  it("passes an indexable, well-described site and builds a real snippet preview", async () => {
    const report = await runSeoVisibilityEngine("github.com", {
      transport: fakeTransport({ html: HARDENED_HTML, headers: HARDENED_HEADERS }) as never, resolver: fakeResolver as never,
    });
    expect(report.checks.find((c) => c.id === "indexable")?.status).toBe("pass");
    expect(report.checks.find((c) => c.id === "sitemap")?.status).toBe("pass");
    expect(report.preview.title).toContain("Example Co");
    expect(report.visibilitySteps.join(" ")).toContain("Search Console");
  });

  it("flags noindex as a failure with steps, never inventing rankings", async () => {
    const html = HARDENED_HTML.replace("<title>", `<meta name="robots" content="noindex" /><title>`);
    const report = await runSeoVisibilityEngine("github.com", {
      transport: fakeTransport({ html, headers: HARDENED_HEADERS }) as never, resolver: fakeResolver as never,
    });
    expect(report.checks.find((c) => c.id === "indexable")?.status).toBe("fail");
    expect(report.visibilitySteps[0]).toContain("noindex");
  });
});
