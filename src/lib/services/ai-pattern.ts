import { parse } from "node-html-parser";
import { desc, eq, and } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { aiPatternChecks } from "@/lib/db/schema";
import {
  consumePremiumRun,
  premiumAccess,
  type PremiumAccess,
} from "@/lib/services/tool-access";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";

/**
 * AI-Pattern & Generic-ness detector (Pro / Ultra Agency only).
 *
 * HONESTY CONTRACT: nothing here proves who — or what — wrote a website.
 * The engine measures how strongly the public copy and structure match
 * patterns that generic AI output and starter templates are known to
 * produce (cliché phrasing, placeholder text, identical CTA rhythms,
 * zero brand-specific detail). Every signal quotes the exact observed
 * evidence, and the score is a pattern-likelihood, labelled as such
 * everywhere it appears. The actionable output is the de-genericize
 * checklist and the agent prompt built from the site's own findings.
 */

import type { AiBand, AiPatternReport, AiSignal } from "@/lib/ai-pattern-shared";
export type { AiBand, AiPatternReport, AiSignal } from "@/lib/ai-pattern-shared";
export { aiPatternToAgentPrompt, aiPatternToMarkdown } from "@/lib/ai-pattern-shared";

const LIMITATIONS = [
  "This measures pattern similarity to known generic AI/template output. It cannot prove a human or an AI wrote the site — a human can write generic copy, and well-directed AI output can be highly specific.",
  "Only the public homepage HTML was analysed (no JavaScript rendering, no login, no form submission).",
  "Signals are quotes from the page itself; judge them in context before acting — some phrases are fine in moderation.",
];

const CLICHES: { phrase: string; why: string }[] = [
  { phrase: "delve", why: "a favourite AI filler verb" },
  { phrase: "elevate your", why: "generic AI elevation-speak" },
  { phrase: "unlock the power", why: "stock AI marketing phrasing" },
  { phrase: "supercharge", why: "stock AI marketing phrasing" },
  { phrase: "seamless experience", why: "claims a feeling instead of a fact" },
  { phrase: "seamlessly", why: "AI adverb filler" },
  { phrase: "in today's fast-paced world", why: "boilerplate AI opener" },
  { phrase: "in the ever-evolving", why: "boilerplate AI opener" },
  { phrase: "game-changer", why: "empty superlative" },
  { phrase: "game changer", why: "empty superlative" },
  { phrase: "cutting-edge", why: "empty superlative" },
  { phrase: "revolutionize", why: "claims revolution without evidence" },
  { phrase: "harness the power", why: "stock AI marketing phrasing" },
  { phrase: "empower your", why: "vague AI empowerment claim" },
  { phrase: "take your business to the next level", why: "says nothing specific" },
  { phrase: "tailored solutions", why: "generic agency-speak" },
  { phrase: "innovative solutions", why: "generic agency-speak" },
  { phrase: "passionate team", why: "unverifiable generic claim" },
  { phrase: "we are committed to excellence", why: "unverifiable generic claim" },
  { phrase: "your trusted partner", why: "generic trust claim without proof" },
  { phrase: "look no further", why: "stock sales filler" },
  { phrase: "dive into", why: "AI filler" },
  { phrase: "embark on a journey", why: "AI filler" },
  { phrase: "vibrant community", why: "generic AI filler" },
  { phrase: "foster", why: "AI-favoured verb, rarely used by the business itself" },
  { phrase: "furthermore", why: "AI connector overuse" },
  { phrase: "moreover", why: "AI connector overuse" },
  { phrase: "it's important to note", why: "AI hedging filler" },
  { phrase: "welcome to the world of", why: "boilerplate AI opener" },
  { phrase: "designed to help you", why: "vague template phrasing" },
  { phrase: "all-in-one solution", why: "generic template claim" },
  { phrase: "boost your productivity", why: "generic template claim" },
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function visibleText(html: string): { text: string; headings: string[]; ctas: string[]; alts: string[] } {
  const root = parse(html);
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  const body = root.querySelector("body") ?? root;
  const text = (body.textContent ?? "").replace(/\s+/g, " ").trim();
  const headings = root
    .querySelectorAll("h1, h2, h3")
    .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const ctas = [
    ...root.querySelectorAll("a, button").map((a) => (a.textContent ?? "").replace(/\s+/g, " ").trim()),
  ].filter((t) => t.length > 0 && t.length <= 40);
  const alts = root
    .querySelectorAll("img[alt]")
    .map((i) => (i.getAttribute("alt") ?? "").trim())
    .filter(Boolean);
  return { text, headings, ctas, alts };
}

export function analyzeAiPatterns(domain: string, finalUrl: string | null, html: string): AiPatternReport {
  const { text, headings, ctas, alts } = visibleText(html);
  const lower = text.toLowerCase();
  const words = text ? text.split(" ").length : 0;
  const signals: AiSignal[] = [];

  // 1. Cliché / filler phrase density.
  const hits: { phrase: string; why: string }[] = [];
  for (const c of CLICHES) {
    if (lower.includes(c.phrase)) hits.push(c);
  }
  if (hits.length > 0) {
    const per100 = words > 0 ? (hits.length / words) * 100 : 0;
    signals.push({
      id: "cliche-phrases",
      label: `Generic AI-style phrasing (${hits.length} phrase${hits.length > 1 ? "s" : ""})`,
      weight: Math.min(30, 8 + hits.length * 4 + (per100 > 1 ? 6 : 0)),
      evidence: hits.slice(0, 8).map((h) => `“${h.phrase}” — ${h.why}`),
      advice: "Replace each flagged phrase with the specific fact it is hiding: numbers, names, places, process details, or a customer outcome you can stand behind.",
    });
  }

  // 2. Placeholder / starter-template text left live.
  const placeholders: string[] = [];
  if (/lorem ipsum/i.test(text)) placeholders.push("Lorem ipsum placeholder text is live on the page");
  // Placeholder NAMES as standalone copy only — never inside an email or
  // domain (hello@example.com is a real contact address, not a template stub).
  if (/(?<![\w@.+-])(acme|your company|company name|john doe|jane doe)(?![\w.-])/i.test(text)) {
    placeholders.push("Template placeholder names (e.g. Acme / Your Company) appear in the copy");
  }
  if (/coming soon|under construction/i.test(text) && words < 400) placeholders.push("“Coming soon / under construction” text dominates a very short page");
  if (placeholders.length) {
    signals.push({
      id: "placeholder-text",
      label: "Placeholder or starter-template text is still live",
      weight: 25,
      evidence: placeholders,
      advice: "Swap every placeholder for real business content, or remove the section until the real content exists.",
    });
  }

  // 3. Emoji-decorated headings (a common raw-AI-output tell).
  const emojiHeadings = headings.filter((h) => EMOJI_RE.test(h));
  if (emojiHeadings.length) {
    signals.push({
      id: "emoji-headings",
      label: "Emoji used as heading decoration",
      weight: 10,
      evidence: emojiHeadings.slice(0, 5).map((h) => `Heading: “${h.slice(0, 80)}”`),
      advice: "Keep headings typographic. If an icon helps scanning, use a real icon set (same style, same size) instead of emoji.",
    });
  }

  // 4. Identical generic CTA rhythm.
  const counts = new Map<string, number>();
  for (const c of ctas) counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1);
  const repeated = [...counts.entries()].filter(([, n]) => n >= 3);
  const genericRepeated = repeated.filter(([t]) => /^(get started|learn more|sign up|start now|get started today|discover more)$/i.test(t));
  if (genericRepeated.length) {
    signals.push({
      id: "repetitive-ctas",
      label: "The same generic call-to-action repeats everywhere",
      weight: 12,
      evidence: genericRepeated.map(([t, n]) => `“${t}” appears ${n} times`),
      advice: "Make each CTA name its destination and payoff (“See the menu”, “Book a Saturday slot”, “Get the price list”) — specificity is what generic output can't fake.",
    });
  }

  // 5. Generic image alt text.
  const badAlts = alts.filter((a) => /^(image|photo|picture|img|unsplash|hero|banner)[\s\d._-]*$/i.test(a));
  if (badAlts.length) {
    signals.push({
      id: "generic-alts",
      label: "Images carry placeholder alt text",
      weight: 8,
      evidence: badAlts.slice(0, 5).map((a) => `alt="${a}"`),
      advice: "Write alt text that describes what is actually in the image (subject, place, action) — or empty alt for pure decoration.",
    });
  }

  // 6. Zero brand-specific anchors on the homepage.
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(text);
  const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  const hasPlace = /\b(street|road|avenue|suite|floor|Lagos|Abuja|London|New York|Berlin|Lekki|Ikeja|Manchester|Toronto|Sydney)\b/i.test(text);
  if (!hasEmail && !hasPhone && !hasPlace && words > 150) {
    signals.push({
      id: "no-specifics",
      label: "No brand-specific details anywhere (no contact, place, or proof)",
      weight: 15,
      evidence: ["No email address, phone number, physical place, named person, price, date, or measurable claim was found in the homepage text"],
      advice: "Add the facts only this business knows: who runs it, where, since when, real prices or ranges, named customers (with permission), and numbers from real work.",
    });
  }

  // 7. Vague superlative headings with no specifics underneath.
  const vagueHeadings = headings.filter((h) => /\b(best|leading|premier|top|#1|world-class|unparalleled)\b/i.test(h));
  if (vagueHeadings.length >= 2) {
    signals.push({
      id: "vague-superlatives",
      label: "Superlative claims (“best”, “leading”, “world-class”) without proof nearby",
      weight: 10,
      evidence: vagueHeadings.slice(0, 5).map((h) => `Heading: “${h.slice(0, 80)}”`),
      advice: "Pair every superlative with its evidence (award, year, review count, ranking) or delete it — unproven superlatives are the fastest genericness tell.",
    });
  }

  const score = Math.min(100, signals.reduce((n, s) => n + s.weight, 0));
  const band: AiBand = score >= 50 ? "high" : score >= 22 ? "moderate" : "low";

  const guardChecklist = [
    "Swap every generic phrase for a verifiable fact (number, name, place, date, price range).",
    "Make every heading answer “what specifically?” — if any business could use it unchanged, rewrite it.",
    "Use real photography of the actual work/premises where possible; label stock as stock.",
    "Give each call-to-action a unique, destination-specific label.",
    "Add proof blocks: named customers (with permission), real outcomes, guarantees you actually honour.",
    "Run a human edit pass that reads the page aloud — generic AI copy sounds smooth and says little; specific copy survives reading aloud.",
    "Re-run this detector after edits and watch the pattern score fall for the right reasons (more specifics, not just synonym swaps).",
  ];

  return {
    domain,
    finalUrl,
    score,
    band,
    signals,
    guardChecklist,
    stats: { words, headings: headings.length, clicheHits: hits.length, uniqueCtas: counts.size },
    limitations: LIMITATIONS,
  };
}

/** Engine: fetch the homepage (SSRF-safe, public only) and analyse it. */
export async function runAiPatternEngine(domainInput: string, deps: { transport?: Transport } = {}): Promise<AiPatternReport> {
  const normalized = normalizeScanInput(domainInput.trim());
  const target = await assertPublicUrl(normalized);
  const host = target.url.hostname;
  const apex = host.replace(/^www\./, "");
  const main = await fetchPublic(new URL(`https://${host}`), {
    maxBytes: 600_000, timeoutMs: 8000, transport: deps.transport,
    userAgent: "ClyvroAiPattern/1.0 (+https://clyvro.vercel.app)",
  }).catch(() => null);
  if (!main || !main.bodyText) {
    throw new ScanError("FETCH_FAILED", "We couldn't read that site's homepage, so there's nothing to analyse yet.");
  }
  return analyzeAiPatterns(apex, main.finalUrl, main.bodyText);
}

export type AiPatternAccess = PremiumAccess;

export async function aiPatternAccess(organizationId: string, dbOverride?: DB): Promise<AiPatternAccess> {
  return premiumAccess(organizationId, "ai-pattern", dbOverride);
}

export async function runAndSaveAiPattern(
  organizationId: string, userId: string, domain: string,
  deps: { transport?: Transport } = {}, dbOverride?: DB,
): Promise<{ id: string; report: AiPatternReport }> {
  const db = dbOverride ?? (await getDb());
  const access = await aiPatternAccess(organizationId, db);
  if (!access.allowed) {
    // Throws PLAN_LIMIT with the friendly allowance copy.
    await consumePremiumRun(organizationId, "ai-pattern", db);
  }
  const report = await runAiPatternEngine(domain, deps);
  // Charge only for a completed analysis (a site we couldn't read
  // shouldn't burn anyone's allowance).
  if (access.allowed) await consumePremiumRun(organizationId, "ai-pattern", db);
  const id = newId();
  const summary = {
    score: report.score,
    band: report.band,
    signals: report.signals.length,
    words: report.stats.words,
  };
  await db.insert(aiPatternChecks).values({
    id, organizationId, requestedBy: userId, domain: report.domain, results: report, summary,
  });
  return { id, report };
}

export async function listAiPatternChecks(organizationId: string, limit = 10, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select().from(aiPatternChecks)
    .where(eq(aiPatternChecks.organizationId, organizationId))
    .orderBy(desc(aiPatternChecks.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

export async function getAiPatternCheck(organizationId: string, id: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(aiPatternChecks)
    .where(and(eq(aiPatternChecks.id, id), eq(aiPatternChecks.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "AI-pattern check not found.");
  return row;
}
