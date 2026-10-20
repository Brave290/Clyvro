process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import { headersTool, redirectsTool, robotsTool } from "@/lib/services/dev-tools";

const fakeResolver = async () => [{ address: "93.184.216.34", family: 4 }];

function transportFor(handler: (url: URL) => { status: number; headers?: Record<string, string>; body?: string }) {
  return async (target: { url: URL }) => {
    const r = handler(target.url);
    const hdrs = { "content-type": "text/html; charset=utf-8", ...(r.headers ?? {}) };
    return {
      status: r.status,
      header: (n: string) => hdrs[n.toLowerCase() as keyof typeof hdrs] ?? null,
      body: (async function* () { yield new TextEncoder().encode(r.body ?? "<html><body>ok</body></html>"); })(),
      cancelBody: async () => undefined,
    };
  };
}

describe("Headers Debugger", () => {
  it("grades the security header set from a live response", async () => {
    const result = await headersTool("github.com", {
      resolver: fakeResolver as never,
      transport: transportFor(() => ({
        status: 200,
        headers: { "strict-transport-security": "max-age=63072000", "x-content-type-options": "nosniff" },
      })) as never,
    });
    expect(result.facts.find((f) => f.label === "Security headers")?.value).toContain("2/6");
    expect(result.sections[0].items.some((i) => i.includes("content-security-policy"))).toBe(true);
  });
});

describe("Redirect Tracer", () => {
  it("walks a chain hop by hop until the final 200", async () => {
    const result = await redirectsTool("http://github.com/old", {
      resolver: fakeResolver as never,
      transport: transportFor((url) => url.pathname === "/old"
        ? { status: 301, headers: { location: "https://github.com/new" } }
        : { status: 200 }) as never,
    });
    expect(result.facts.find((f) => f.label === "Hops")?.value).toBe("2");
    expect(result.sections[0].items[0]).toContain("301");
    expect(result.facts.find((f) => f.label === "Upgrades to HTTPS")?.value).toBe("Yes");
  });
});

describe("Robots & Sitemap Tester", () => {
  it("reports a blocked path as blocked (the classic Disallow trap)", async () => {
    const result = await robotsTool("github.com", "/pricing", {
      resolver: fakeResolver as never,
      transport: transportFor((url) => url.pathname === "/robots.txt"
        ? { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /pricing\nSitemap: https://github.com/sitemap.xml\n" }
        : url.pathname === "/sitemap.xml"
          ? { status: 200, headers: { "content-type": "text/plain" }, body: `<urlset><url><loc>https://github.com/</loc></url></urlset>` }
          : { status: 200 }) as never,
    });
    const crawl = result.facts.find((f) => f.label.startsWith("Is /pricing"));
    expect(crawl?.value).toContain("BLOCKED");
    expect(crawl?.status).toBe("fail");
  });
});

describe("domain verification diagnostics", () => {
  it("distinguishes 'no records at all' from 'records exist but value is stale'", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const verification = await import("@/lib/services/domain-verification");
    const acc = await accounts.registerAccount(
      { name: "V", email: "verify@example.com", password: "a-long-password-123" }, db);

    const issued1 = await verification.issueDomainVerification(acc.organizationId, acc.userId, "example.com", db);
    await expect(verification.checkDomainVerification(
      acc.organizationId, issued1.id, { resolveTxt: async () => [] }, db,
    )).rejects.toThrow(/No TXT records were returned/);

    await expect(verification.checkDomainVerification(
      acc.organizationId, issued1.id,
      { resolveTxt: async () => [["clyvro-verification=stale-old-value"]], now: () => Date.now() + 60_000 },
      db,
    )).rejects.toThrow(/none matches the current code/);
  });

  it("flags platform subdomains as DNS-unverifiable and points at the meta tag", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const verification = await import("@/lib/services/domain-verification");
    const acc = await accounts.registerAccount(
      { name: "V2", email: "verify2@example.com", password: "a-long-password-123" }, db);
    const issued = await verification.issueDomainVerification(acc.organizationId, acc.userId, "mysite.vercel.app", db);
    await expect(verification.checkDomainVerification(
      acc.organizationId, issued.id, { resolveTxt: async () => [] }, db,
    )).rejects.toThrow(/meta-tag method/);
  });
});
