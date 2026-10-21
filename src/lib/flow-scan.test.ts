process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import {
  createFlowScan,
  flowScanAccess,
  isDangerousAction,
  navigationBlockReason,
  pickFlowLinks,
} from "@/lib/services/flow-scan";
import { flowScanToAgentPrompt, flowScanToMarkdown, type FlowReport } from "@/lib/flow-scan-shared";

describe("navigation guard (SSRF boundary for the browser)", () => {
  it("allows public web URLs", () => {
    expect(navigationBlockReason("https://Example.com/pricing")).toBeNull();
    expect(navigationBlockReason("http://93.184.216.34/")).toBeNull();
  });
  it("blocks local, private and non-web destinations", () => {
    expect(navigationBlockReason("http://localhost:3000/admin")).toMatch(/local/);
    expect(navigationBlockReason("https://app.local/x")).toMatch(/local/);
    expect(navigationBlockReason("http://127.0.0.1/")).toMatch(/non-public/);
    expect(navigationBlockReason("http://192.168.1.1/")).toMatch(/non-public/);
    expect(navigationBlockReason("http://[::1]/")).toMatch(/non-public/);
    expect(navigationBlockReason("file:///etc/passwd")).toMatch(/scheme/);
    expect(navigationBlockReason("javascript:alert(1)")).toMatch(/scheme/);
  });
});

describe("dangerous actions are never clicked", () => {
  it("flags purchase/delete/auth actions by text or URL", () => {
    expect(isDangerousAction("Checkout", "/cart")).toBe(true);
    expect(isDangerousAction("Delete my account", "/settings")).toBe(true);
    expect(isDangerousAction("Continue", "/checkout/confirm")).toBe(true);
    expect(isDangerousAction("Sign out", "/account")).toBe(true);
    expect(isDangerousAction("See pricing", "/pricing")).toBe(false);
    expect(isDangerousAction("Read the guide", "/guides/start")).toBe(false);
  });
});

describe("flow link picking", () => {
  it("stays same-origin, dedupes, skips assets and dangerous links, and caps", () => {
    const links = [
      { href: "/pricing", text: "See pricing" },
      { href: "/pricing", text: "Pricing again" },
      { href: "https://other.example/x", text: "External" },
      { href: "/checkout", text: "Buy" },
      { href: "/logo.png", text: "Logo" },
      { href: "/about", text: "About us" },
      { href: "/blog", text: "Blog" },
    ];
    const picked = pickFlowLinks(links, "https://Example.com/", 2);
    expect(picked).toEqual(["https://example.com/pricing", "https://example.com/about"]);
  });
});

describe("flow scan plan gate (Pro/Ultra only)", () => {
  it("denies Freemium and allows Pro", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const accounts = await import("@/lib/services/accounts");
    const acct = await accounts.registerAccount(
      { name: "Flow", email: "flow-gate@example.com", password: "a-long-password-123" }, db);
    expect((await flowScanAccess(acct.organizationId, db)).allowed).toBe(false);
    await db.update(schema.organizations)
      .set({ adminPlanId: "pro" })
      .where(eq(schema.organizations.id, acct.organizationId));
    expect((await flowScanAccess(acct.organizationId, db)).allowed).toBe(true);
    // createFlowScan validates the target is public before queueing
    // (localhost is rejected inside assertPublicUrl/normalize).
    await expect(createFlowScan(acct.organizationId, acct.userId, "http://localhost:9999", db))
      .rejects.toThrow();
  });
});

describe("flow exports carry the observed evidence", () => {
  const report: FlowReport = {
    targetUrl: "https://Example.com/",
    startedAt: "2026-10-21T00:00:00.000Z",
    durationMs: 4200,
    pages: [{ url: "https://Example.com/", finalUrl: "https://Example.com/", status: 200, title: "Acme", renderedWords: 320, forms: 1, buttons: 4, internalLinks: 6 }],
    consoleErrors: [{ page: "https://Example.com/", text: "TypeError: x is not a function" }],
    failedRequests: [{ page: "https://Example.com/", url: "https://Example.com/api/plans", failure: "net::ERR_FAILED" }],
    notes: ["No failed network requests were observed on the pages visited."],
    tech: ["Next.js"],
    limitations: ["Forms are never submitted."],
  };
  const steps = [{ at: "2026-10-21T00:00:01.000Z", label: "Opening the start page", level: "step" as const }];

  it("markdown includes pages, errors and the step log", () => {
    const md = flowScanToMarkdown(report, steps);
    expect(md).toContain("TypeError: x is not a function");
    expect(md).toContain("## Live step log");
    expect(md).toContain("Next.js");
  });
  it("agent prompt instructs verification and approval, quoting failures", () => {
    const prompt = flowScanToAgentPrompt(report, steps);
    expect(prompt).toContain("net::ERR_FAILED");
    expect(prompt).toContain("wait for my approval");
    expect(prompt).toContain("can't reproduce");
  });
});
