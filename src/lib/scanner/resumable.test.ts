import { describe, expect, it, vi } from "vitest";
import { crawlSiteSlice, type FetchPageFn } from "./crawl";
import { runScanSlice } from "./scan";
import { type FetchOutcome } from "./types";
import { fetchPublic } from "./fetcher";
import { SCAN_CONFIG } from "./config";

vi.mock("./fetcher", () => ({ fetchPublic: vi.fn() }));

function page(url: string, html: string): FetchOutcome {
  return { requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", isHtml: true,
    bodyText: html, bytes: html.length, truncated: false, durationMs: 1, redirectChain: [] };
}

const fetchPage: FetchPageFn = async (url, opts) => opts.headersOnly
  ? { ...page(url.href, ""), bodyText: null }
  : page(url.href, '<a href="/next">next</a>');

describe("scan checkpoint validation", () => {
  it("rejects malformed and body-bearing checkpoint input", async () => {
    if (!(globalThis as { File?: unknown }).File) Object.defineProperty(globalThis, "File", { value: class File {} });
    const { deserializeScanCheckpoint } = await import("./scan");
    const first = await crawlSiteSlice(new URL("https://checkpoint.example/"), { fetchPage, deadlineAt: Date.now() + 60_000, workBudget: 1 });
    expect(first.checkpoint).not.toBeNull();
    expect(() => deserializeScanCheckpoint({ nope: true })).toThrowError(/checkpoint/i);
    const withBody = JSON.parse(JSON.stringify(first.checkpoint));
    withBody.crawl.startOutcome.bodyText = "raw html must never persist";
    expect(() => deserializeScanCheckpoint(withBody)).toThrowError(/checkpoint/i);
  });

  it("resumes after a daily pause beyond the 45-second slice without finalizing", async () => {
    const mockedFetchPublic = vi.mocked(fetchPublic);
    mockedFetchPublic.mockImplementation(async (url, opts) =>
      opts?.headersOnly
        ? { ...page(url.href, ""), bodyText: null }
        : page(url.href, url.pathname === "/next" ? '<a href="/third">third</a>' : url.pathname === "/third" ? "" : '<a href="/next">next</a>'),
    );
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const first = await runScanSlice("https://checkpoint.example/", { resolver, now: () => nowMs, workBudget: 1 });
    expect(first.status).toBe("paused");
    expect(first.done).toBe(false);
    expect(first.checkpoint).not.toBeNull();

    nowMs += SCAN_CONFIG.deadlineMs + 1_000;
    const resumed = await runScanSlice(undefined, {
      resolver,
      now: () => nowMs,
      workBudget: 2,
      checkpoint: first.checkpointJson!,
    });
    expect(resumed.status).toBe("paused");
    expect(resumed.done).toBe(false);
    expect(resumed.report).toBeNull();
    expect(resumed.checkpoint?.deadlineAt).toBe(first.checkpoint?.deadlineAt);
    expect(resumed.checkpoint?.crawl.coverage.pagesFetched).toBeGreaterThan(first.checkpoint?.crawl.coverage.pagesFetched ?? 0);
  });

  it("keeps the normalized checkpoint locale when a resume supplies another locale", async () => {
    const mockedFetchPublic = vi.mocked(fetchPublic);
    mockedFetchPublic.mockClear();
    mockedFetchPublic.mockImplementation(async (url, opts) =>
      opts?.headersOnly ? { ...page(url.href, ""), bodyText: null } : page(url.href, '<a href="/next">next</a>'),
    );
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const first = await runScanSlice("https://checkpoint-locale.example/", { resolver, now: () => nowMs, locale: "fr-ca", workBudget: 1 });
    expect(first.checkpoint?.locale).toBe("fr-CA");
    nowMs += 1_000;
    await runScanSlice(undefined, { resolver, now: () => nowMs, locale: "de-DE", workBudget: 1, checkpoint: first.checkpointJson! });
    expect(mockedFetchPublic.mock.calls.every(([, opts]) => opts?.locale === "fr-CA")).toBe(true);
  });
});
