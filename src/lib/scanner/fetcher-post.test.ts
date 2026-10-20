import { describe, it, expect } from "vitest";
import { fetchPublic, type RawResponse, type Transport } from "./fetcher";
import type { Resolver } from "./ssrf";

const resolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

function raw(status: number, headers: Record<string, string> = {}, body = ""): RawResponse {
  return {
    status,
    header: (n) => headers[n.toLowerCase()] ?? null,
    body: (async function* () { yield new TextEncoder().encode(body); })(),
    cancelBody: async () => undefined,
  };
}

describe("fetchPublic POST (cron jobs / readiness)", () => {
  it("sends method + body and reports the FIRST response (no redirect follow)", async () => {
    const seen: { method: string; body?: string; ua?: string }[] = [];
    const transport: Transport = async (_target, init) => {
      seen.push({ method: init.method, body: init.body, ua: init.headers["user-agent"] });
      return raw(302, { location: "https://example.com/elsewhere" });
    };
    const out = await fetchPublic(new URL("https://example.com/hook"), {
      resolver, transport, method: "POST", body: '{"ping":1}', userAgent: "ClyvroCron/1.0",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", body: '{"ping":1}', ua: "ClyvroCron/1.0" });
    expect(out.status).toBe(302);
    expect(out.finalUrl).toBe("https://example.com/hook");
  });

  it("captures allowlisted response headers only", async () => {
    const transport: Transport = async () =>
      raw(200, {
        "content-type": "text/html", server: "nginx", "x-powered-by": "PHP/8.3",
        "strict-transport-security": "max-age=63072000",
        "set-cookie": "session=SECRET", "x-internal-debug": "nope",
      }, "<html>ok</html>");
    const out = await fetchPublic(new URL("https://example.com/"), { resolver, transport });
    expect(out.headers?.server).toBe("nginx");
    expect(out.headers?.["x-powered-by"]).toBe("PHP/8.3");
    expect(out.headers?.["strict-transport-security"]).toContain("max-age");
    expect(out.headers?.["set-cookie"]).toBeUndefined();
    expect(out.headers?.["x-internal-debug"]).toBeUndefined();
  });

  it("GET still follows redirects (scanner behaviour unchanged)", async () => {
    const transport: Transport = async (target) =>
      target.url.pathname === "/old"
        ? raw(301, { location: "https://example.com/new" })
        : raw(200, { "content-type": "text/html" }, "<html>new</html>");
    const out = await fetchPublic(new URL("https://example.com/old"), { resolver, transport });
    expect(out.status).toBe(200);
    expect(out.finalUrl).toBe("https://example.com/new");
  });
});
