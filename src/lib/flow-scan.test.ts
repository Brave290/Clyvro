process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import {
  classifyRequestFailure,
  createFlowScan,
  flowScanAccess,
  isDangerousAction,
  navigationBlockReason,
  pickFlowLinks,
} from "@/lib/services/flow-scan";
import {
  analyzeUiMeasurements,
  flowScanToAgentPrompt,
  flowScanToMarkdown,
  type FlowReport,
  type UiMeasurements,
} from "@/lib/flow-scan-shared";

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

describe("flow scan plan allowances (every plan can test; lower plans capped)", () => {
  it("Freemium gets 1 run/month, Pro 25 — consumption is enforced server-side", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const accounts = await import("@/lib/services/accounts");
    const { consumePremiumRun, refundPremiumRun } = await import("@/lib/services/tool-access");
    const acct = await accounts.registerAccount(
      { name: "Flow", email: "flow-gate@example.com", password: "a-long-password-123" }, db);

    const free = await flowScanAccess(acct.organizationId, db);
    expect(free.allowed).toBe(true);
    expect(free.limit).toBe(1);
    expect(free.remaining).toBe(1);
    expect(free.period).toBe("monthly");

    // One consumed run exhausts the Freemium month; the next is refused
    // with PLAN_LIMIT. A refund (e.g. browser never started) gives it back.
    await consumePremiumRun(acct.organizationId, "flow-scan", db);
    expect((await flowScanAccess(acct.organizationId, db)).allowed).toBe(false);
    await expect(consumePremiumRun(acct.organizationId, "flow-scan", db)).rejects.toThrow(/PLAN_LIMIT|allowance|reached/i);
    await refundPremiumRun(acct.organizationId, "flow-scan", db);
    expect((await flowScanAccess(acct.organizationId, db)).allowed).toBe(true);

    await db.update(schema.organizations)
      .set({ adminPlanId: "pro" })
      .where(eq(schema.organizations.id, acct.organizationId));
    const pro = await flowScanAccess(acct.organizationId, db);
    expect(pro.allowed).toBe(true);
    expect(pro.limit).toBe(25);

    // createFlowScan validates the target is public before queueing
    // (localhost is rejected inside assertPublicUrl/normalize).
    await expect(createFlowScan(acct.organizationId, acct.userId, "http://localhost:9999", db))
      .rejects.toThrow();
  });

  it("classifies net::ERR_ABORTED as a cancelled request, never a failure", () => {
    expect(classifyRequestFailure("net::ERR_ABORTED", "https://Example.com/privacy?_rsc=abc123")).toBe("cancelled");
    expect(classifyRequestFailure("net::ERR_NAME_NOT_RESOLVED", "https://Example.com/x")).toBe("failed");
    expect(classifyRequestFailure("net::ERR_CONNECTION_REFUSED", "https://Example.com/x")).toBe("failed");
  });
});

describe("UI discrepancy analysis (measured geometry, not opinion)", () => {
  const base: UiMeasurements = {
    viewportWidth: 1280, viewportHeight: 800, scrollWidth: 1280,
    elements: [
      { text: "Book a consultation", ariaLabel: null, x: 600, y: 300, width: 220, height: 48, isCta: true },
      { text: "Home", ariaLabel: null, x: 40, y: 20, width: 60, height: 24, isCta: false },
    ],
  };
  const ids = (m: UiMeasurements) => analyzeUiMeasurements(m).map((d) => d.id);

  it("a healthy fold produces no discrepancies", () => {
    expect(ids(base)).toEqual([]);
  });

  it("flags a missing fold CTA, tiny targets, overflow, unlabelled and overlapping controls", () => {
    const bad: UiMeasurements = {
      viewportWidth: 390, viewportHeight: 700, scrollWidth: 480,
      elements: [
        { text: "Home", ariaLabel: null, x: 10, y: 12, width: 40, height: 18, isCta: false },
        { text: "", ariaLabel: null, x: 330, y: 10, width: 20, height: 20, isCta: false },
        { text: "Menu", ariaLabel: "Open menu", x: 335, y: 12, width: 22, height: 22, isCta: false },
        { text: "Get started", ariaLabel: null, x: 20, y: 1400, width: 200, height: 44, isCta: true },
      ],
    };
    const got = ids(bad);
    expect(got).toContain("no-cta-in-fold");
    expect(got).toContain("small-tap-targets");
    expect(got).toContain("horizontal-overflow");
    expect(got).toContain("empty-interactive");
    expect(got).toContain("overlapping-interactive");
    // Every discrepancy carries a concrete fix.
    for (const d of analyzeUiMeasurements(bad)) {
      expect(d.recommendation.length).toBeGreaterThan(20);
      expect(d.evidence.length).toBeGreaterThan(10);
    }
  });

  it("notes (not flaws) competing CTAs above the fold", () => {
    const many: UiMeasurements = {
      ...base,
      elements: ["Sign up", "Get started", "Book a demo", "Start trial", "Contact us"]
        .map((text, i) => ({ text, ariaLabel: null, x: 40 + i * 170, y: 200, width: 150, height: 44, isCta: true })),
    };
    const found = analyzeUiMeasurements(many).find((d) => d.id === "competing-ctas");
    expect(found?.level).toBe("note");
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
    uiDiscrepancies: [
      { id: "no-cta-in-fold", level: "flaw", title: "No call-to-action in the first screenful", evidence: "(/) 3 interactive element(s) visible, none a CTA.", recommendation: "Put ONE primary CTA in the first viewport." },
      { id: "competing-ctas", level: "note", title: "5 competing calls-to-action above the fold", evidence: "(/) First screenful CTAs: “Sign up”, “Get started”.", recommendation: "Pick the single action this page exists for." },
    ],
    findings: [{ ruleId: "CLY-021", severity: "high", title: "Missing page title", page: "https://cafe.example/" }],
    aiPattern: { score: 62, band: "Mixed", topSignals: ["Generic headline copy"] },
  };
  const steps = [{ at: "2026-10-21T00:00:01.000Z", label: "Opening the start page", level: "step" as const }];

  it("markdown includes pages, errors and the step log", () => {
    const md = flowScanToMarkdown(report, steps);
    expect(md).toContain("TypeError: x is not a function");
    expect(md).toContain("## Live step log");
    expect(md).toContain("Next.js");
    expect(md).toContain("UI discrepancies");
    expect(md).toContain("[FLAW] No call-to-action");
    expect(md).toContain("CLY-021");
    expect(md).toContain("62/100 (Mixed)");
  });
  it("agent prompt instructs verification and approval, quoting failures", () => {
    const prompt = flowScanToAgentPrompt(report, steps);
    expect(prompt).toContain("net::ERR_FAILED");
    expect(prompt).toContain("wait for my approval");
    expect(prompt).toContain("can't reproduce");
    expect(prompt).toContain("No call-to-action in the first screenful");
    expect(prompt).toContain("UI notes worth a human look:");
  });
});
