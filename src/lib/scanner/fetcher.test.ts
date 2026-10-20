import { describe, it, expect, vi } from "vitest";
import { fetchPublic, type RawResponse, type Transport } from "./fetcher";
import type { Resolver } from "./ssrf";
import type { ValidatedTarget } from "./types";
import { SCAN_CONFIG } from "./config";

const resolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const privateResolver: Resolver = async (host) =>
  host === "internal.example.com"
    ? [{ address: "192.168.0.9", family: 4 }]
    : [{ address: "93.184.216.34", family: 4 }];

function rawResponse(
  status: number,
  headers: Record<string, string> = {},
  body = "",
): RawResponse {
  const chunks = [new TextEncoder().encode(body)];
  return {
    status,
    header: (n) => headers[n.toLowerCase()] ?? null,
    body: (async function* () {
      for (const c of chunks) yield c;
    })(),
    cancelBody: async () => undefined,
  };
}

const transportFrom =
  (handler: (url: string, target: ValidatedTarget) => RawResponse | Promise<RawResponse>): Transport =>
  async (target) =>
    handler(target.url.href, target);

const HTML = { "content-type": "text/html; charset=utf-8" };

describe("fetchPublic — happy path and pinning", () => {
  it("fetches HTML and reports outcome facts", async () => {
    const transport = transportFrom(() => rawResponse(200, HTML, "<html>hi</html>"));
    const out = await fetchPublic(new URL("https://example.com/"), { resolver, transport });
    expect(out.status).toBe(200);
    expect(out.isHtml).toBe(true);
    expect(out.bodyText).toContain("hi");
    expect(out.finalUrl).toBe("https://example.com/");
  });

  it("passes the validated (pinned) IP set to the transport", async () => {
    let seenIps: string[] = [];
    const transport: Transport = async (target) => {
      seenIps = target.ips;
      return rawResponse(200, HTML, "ok");
    };
    await fetchPublic(new URL("https://example.com/"), { resolver, transport });
    expect(seenIps).toEqual(["93.184.216.34"]);
  });
});

describe("fetchPublic — redirect attacks", () => {
  it("blocks a redirect to a host resolving to a private IP", async () => {
    const transport = transportFrom((url) =>
      url === "https://example.com/"
        ? rawResponse(302, { location: "http://internal.example.com/secret" })
        : rawResponse(200, HTML, "should never be reached"),
    );
    await expect(
      fetchPublic(new URL("https://example.com/"), { resolver: privateResolver, transport }),
    ).rejects.toMatchObject({ code: "BLOCKED_IP" });
  });

  it("blocks a redirect straight to a private IP literal", async () => {
    const transport = transportFrom(() => rawResponse(302, { location: "http://169.254.169.254/latest/meta-data/" }));
    await expect(
      fetchPublic(new URL("https://example.com/"), { resolver, transport }),
    ).rejects.toMatchObject({ code: "BLOCKED_IP" });
  });

  it("blocks a redirect to a non-http scheme", async () => {
    const transport = transportFrom(() => rawResponse(302, { location: "file:///etc/passwd" }));
    await expect(
      fetchPublic(new URL("https://example.com/"), { resolver, transport }),
    ).rejects.toMatchObject({ code: "BLOCKED_PROTOCOL" });
  });

  it("enforces the redirect limit", async () => {
    const transport = transportFrom(() => rawResponse(302, { location: "https://example.com/loop" }));
    await expect(
      fetchPublic(new URL("https://example.com/"), { resolver, transport, maxRedirects: 3 }),
    ).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
  });

  it("follows a legitimate cross-host redirect after revalidation", async () => {
    const transport = transportFrom((url) =>
      url === "https://example.com/"
        ? rawResponse(301, { location: "https://www.example.com/" })
        : rawResponse(200, HTML, "landed"),
    );
    const out = await fetchPublic(new URL("https://example.com/"), { resolver, transport });
    expect(out.finalUrl).toBe("https://www.example.com/");
    expect(out.redirectChain).toEqual(["https://www.example.com/"]);
  });

  it("bounds DNS resolution for a redirect target", async () => {
    vi.useFakeTimers();
    try {
      const redirectResolver: Resolver = async (host) => host === "hang.example.com"
        ? new Promise(() => undefined)
        : [{ address: "93.184.216.34", family: 4 }];
      const transport = transportFrom((url) => url === "https://example.com/"
        ? rawResponse(302, { location: "https://hang.example.com/" })
        : rawResponse(200, HTML, "should never be reached"));
      const pending = fetchPublic(new URL("https://example.com/"), { resolver: redirectResolver, transport });
      const assertion = expect(pending).rejects.toMatchObject({ code: "DNS_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(SCAN_CONFIG.dnsLookupTimeoutMs);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchPublic — resource limits", () => {
  it("truncates oversized bodies instead of buffering them whole", async () => {
    const big = "x".repeat(10_000);
    const transport = transportFrom(() => rawResponse(200, HTML, big));
    const out = await fetchPublic(new URL("https://example.com/"), { resolver, transport, maxBytes: 500 });
    expect(out.truncated).toBe(true);
    expect(out.bytes).toBeGreaterThan(500); // counted accurately
    expect(out.bodyText!.length).toBeLessThanOrEqual(10_000);
  });

  it("times out when the transport stalls past the per-request limit", async () => {
    const transport: Transport = (_t, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    await expect(
      fetchPublic(new URL("https://example.com/"), { resolver, transport, timeoutMs: 30 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("flags non-HTML content", async () => {
    const transport = transportFrom(() => rawResponse(200, { "content-type": "application/pdf" }, "%PDF"));
    const out = await fetchPublic(new URL("https://example.com/file.pdf"), { resolver, transport });
    expect(out.isHtml).toBe(false);
  });

  it("does not download non-HTML bodies unless explicitly allowed (robots.txt)", async () => {
    let iterated = false;
    const lazyBody: RawResponse = {
      status: 200,
      header: (n) => (n === "content-type" ? "text/plain" : null),
      body: (async function* () {
        iterated = true;
        yield new TextEncoder().encode("User-agent: *\nDisallow: /x");
      })(),
      cancelBody: async () => undefined,
    };
    const transport = transportFrom(() => lazyBody);
    const skipped = await fetchPublic(new URL("https://example.com/robots.txt"), { resolver, transport });
    expect(skipped.bodyText).toBeNull();
    expect(iterated).toBe(false);

    const transport2 = transportFrom(() => rawResponse(200, { "content-type": "text/plain" }, "User-agent: *"));
    const read = await fetchPublic(new URL("https://example.com/robots.txt"), { resolver, transport: transport2, allowNonHtmlBody: true });
    expect(read.bodyText).toContain("User-agent");
  });

  it("headers-only mode skips body download", async () => {
    const transport = transportFrom(() => rawResponse(404, HTML, "not found body"));
    const out = await fetchPublic(new URL("https://example.com/missing"), { resolver, transport, headersOnly: true });
    expect(out.status).toBe(404);
    expect(out.bodyText).toBeNull();
  });
});
