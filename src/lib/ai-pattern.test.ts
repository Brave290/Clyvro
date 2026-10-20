process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";
import { analyzeAiPatterns, aiPatternAccess, runAndSaveAiPattern } from "@/lib/services/ai-pattern";
import { aiPatternToAgentPrompt, aiPatternToMarkdown } from "@/lib/ai-pattern-shared";

const GENERIC_HTML = `<!doctype html><html><head><title>Elevate Your Business</title></head><body>
  <h1>🚀 Welcome to the world of synergy</h1>
  <p>In today's fast-paced world, you need cutting-edge, innovative solutions. We delve deep to supercharge
  your workflow with a seamless experience. Furthermore, our passionate team will unlock the power of
  tailored solutions and take your business to the next level. Look no further — embark on a journey
  with your trusted partner. Lorem ipsum dolor sit amet.</p>
  <h2>✨ Our Services</h2><p>We foster vibrant community growth.</p>
  <a href="/a">Get Started</a><a href="/b">Get Started</a><a href="/c">Get Started</a>
  <img src="/x.jpg" alt="image">
  <h2>World-class results</h2><h2>The best platform</h2>
</body></html>`;

const SPECIFIC_HTML = `<!doctype html><html><head><title>Johnson Plumbing — Lekki, Lagos</title></head><body>
  <h1>Plumbing repairs in Lekki, done same-day</h1>
  <p>Johnson Plumbing was founded in 2016 by Tunde Johnson. We fix burst pipes, water heaters and blocked
  drains across Lekki Phase 1 and Ajah. A standard call-out costs ₦15,000, quoted before we start. Call us on
  0803 555 1234 or email hello@example.com. 214 verified reviews, average 4.8 stars.</p>
  <h2>Water heater installation — ₦85,000 including parts</h2>
  <p>Installed in one visit, two-year warranty on labour.</p>
  <a href="/pricing">See our price list</a><a href="/book">Book a Saturday slot</a>
  <img src="/team.jpg" alt="Tunde Johnson repairing a water heater in a Lekki kitchen">
</body></html>`;

describe("AI-pattern analysis (pattern likelihood, never authorship proof)", () => {
  it("scores generic AI-style copy high, with quoted evidence", () => {
    const r = analyzeAiPatterns("Example.com", "https://Example.com/", GENERIC_HTML);
    expect(r.band).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(50);
    const ids = r.signals.map((s) => s.id);
    expect(ids).toContain("cliche-phrases");
    expect(ids).toContain("placeholder-text");
    expect(ids).toContain("emoji-headings");
    expect(ids).toContain("repetitive-ctas");
    expect(ids).toContain("generic-alts");
    expect(ids).toContain("vague-superlatives");
    expect(r.signals.find((s) => s.id === "cliche-phrases")?.evidence.join(" ")).toContain("delve");
  });

  it("scores specific, factual copy low", () => {
    const r = analyzeAiPatterns("Johnson.example", "https://Johnson.example/", SPECIFIC_HTML);
    expect(r.band).toBe("low");
    expect(r.score).toBeLessThan(22);
  });

  it("exports carry the not-proof disclaimer and a no-invention agent prompt", () => {
    const r = analyzeAiPatterns("Example.com", "https://Example.com/", GENERIC_HTML);
    const md = aiPatternToMarkdown(r);
    expect(md).toContain("NOT proof");
    expect(md).toContain("Guard checklist");
    const prompt = aiPatternToAgentPrompt(r);
    expect(prompt).toContain("Never invent facts");
    expect(prompt).toContain("[ADD:");
    expect(prompt).toContain("wait for my approval");
    expect(prompt).toContain("delve");
  });
});

describe("AI-pattern plan gate (Pro/Ultra only)", () => {
  it("denies Freemium with upgrade copy and allows Pro", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const accounts = await import("@/lib/services/accounts");
    const acct = await accounts.registerAccount(
      { name: "Gate", email: "ai-gate@example.com", password: "a-long-password-123" }, db);
    expect((await aiPatternAccess(acct.organizationId, db)).allowed).toBe(false);
    await expect(runAndSaveAiPattern(acct.organizationId, acct.userId, "Example.com", {}, db))
      .rejects.toThrow(/Pro and Ultra Agency/);
    await db.update(schema.organizations)
      .set({ adminPlanId: "pro" })
      .where(eq(schema.organizations.id, acct.organizationId));
    expect((await aiPatternAccess(acct.organizationId, db)).allowed).toBe(true);
    expect((await aiPatternAccess(acct.organizationId, db)).planName).toBe("Pro");
  });
});
