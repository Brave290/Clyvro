import { describe, expect, it } from "vitest";
import { parsePage } from "./parse";
import { extractProbeTargets, runVulnProbes, type ProbeFetch } from "./vuln-probes";
import type { FetchOutcome } from "./types";

function outcome(url: string, body: string): FetchOutcome {
  return {
    requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", isHtml: true,
    bodyText: body, bytes: body.length, truncated: false, durationMs: 5, redirectChain: [],
  };
}

const pageWithLinks = (links: string[]) => parsePage(outcome(
  "https://shop.example/",
  `<!doctype html><html><head><title>Shop</title></head><body>${links.map((l) => `<a href="${l}">go</a>`).join("")}<p>${"words ".repeat(30)}</p></body></html>`,
));

describe("deep-scan injection detection probes", () => {
  it("extracts bounded, deduped, same-origin GET parameters and skips destructive ones", () => {
    const page = pageWithLinks([
      "/item?id=3", "/item?id=9", "/item?cat=shoes", "/other?x=1",
      "https://evil.example/item?id=1", "/cart?action=delete&id=2", "/plain",
    ]);
    const targets = extractProbeTargets([page]);
    expect(targets.length).toBeLessThanOrEqual(5);
    expect(targets.map((t) => `${t.param}`)).toEqual(expect.arrayContaining(["id", "cat", "x"]));
    expect(targets.some((t) => t.url.includes("evil.example"))).toBe(false);
    expect(targets.some((t) => t.url.includes("delete"))).toBe(false);
    // /item?id deduped to one target
    expect(targets.filter((t) => t.param === "id" && t.url.includes("/item"))).toHaveLength(1);
  });

  it("flags SQLi when a quote probe makes the server confess a DB error (baseline clean)", async () => {
    const fetchFn: ProbeFetch = async (url) => {
      if (url.searchParams.get("id")?.endsWith("'")) {
        return outcome(url.href, "<html><body>Warning: SQL syntax error near ''3''' at line 1 — MySQL server version</body></html>");
      }
      return outcome(url.href, "<html><body>Product page, all normal.</body></html>");
    };
    const { findings, targets } = await runVulnProbes([pageWithLinks(["/item?id=3"])], fetchFn);
    expect(targets).toBe(1);
    expect(findings.map((f) => f.ruleId)).toContain("CLY-201");
    expect(findings[0].confidenceBasis).toBe("measured");
  });

  it("does NOT flag SQLi when the baseline already shows the error string", async () => {
    const fetchFn: ProbeFetch = async (url) =>
      outcome(url.href, "<html><body>Our docs mention SQLSTATE[42000] in examples.</body></html>");
    const { findings } = await runVulnProbes([pageWithLinks(["/item?id=3"])], fetchFn);
    expect(findings).toHaveLength(0);
  });

  it("flags reflected XSS when the marker returns verbatim, and stays silent on a clean site", async () => {
    const xssFetch: ProbeFetch = async (url) => {
      const q = url.searchParams.get("q") ?? "";
      return outcome(url.href, `<html><body>Results for: ${q}</body></html>`);
    };
    const page = pageWithLinks(["/search?q=shoes"]);
    const flagged = await runVulnProbes([page], xssFetch);
    // The plain reflection also reflects the SQLi/LFI payloads as text,
    // but only the XSS marker matches its signature.
    expect(flagged.findings.map((f) => f.ruleId)).toEqual(["CLY-202"]);

    const cleanFetch: ProbeFetch = async (url) =>
      outcome(url.href, "<html><body>Encoded output only: &lt;tag&gt;.</body></html>");
    const clean = await runVulnProbes([page], cleanFetch);
    expect(clean.findings).toHaveLength(0);
  });

  it("flags file inclusion on a PHP include warning that baseline lacks", async () => {
    const fetchFn: ProbeFetch = async (url) => {
      const p = url.searchParams.get("page") ?? "";
      if (p.includes("clyvro-nonexistent")) {
        return outcome(url.href, "<html><body>Warning: include(../../../../clyvro-nonexistent-9x7): failed to open stream: No such file</body></html>");
      }
      return outcome(url.href, "<html><body>Docs page.</body></html>");
    };
    const { findings } = await runVulnProbes([pageWithLinks(["/view?page=about"])], fetchFn);
    expect(findings.map((f) => f.ruleId)).toEqual(["CLY-203"]);
  });

  it("flags SSTI when {{1337*1337}} evaluates to 1787569", async () => {
    const fetchFn: ProbeFetch = async (url) => {
      const q = url.searchParams.get("q") ?? "";
      if (q.includes("{{1337*1337}}")) {
        return outcome(url.href, "<html><body>Hello 1787569</body></html>");
      }
      return outcome(url.href, "<html><body>Hello world</body></html>");
    };
    const { findings } = await runVulnProbes([pageWithLinks(["/search?q=shoes"])], fetchFn);
    expect(findings.map((f) => f.ruleId)).toEqual(["CLY-205"]);
  });
});
