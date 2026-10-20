import type { Category, ConfidenceBasis, Finding, Severity } from "@/lib/types";
import type { FetchRecord, ParsedPage, Referrer } from "./types";
import { RULESET_VERSION } from "./config";

/**
 * Deterministic rule set v1.0.0 — every finding is produced by a named rule
 * over observed fetch/parse facts. Severity (impact if true), confidence
 * basis (how it was detected) and effort are independent axes.
 *
 * Confidence language follows the product contract:
 *  - "confirmed"  — directly observed (HTTP status, attribute presence)
 *  - "measured"   — observed via a measurement with stated limits
 *  - "heuristic"  — pattern-based inference that needs human review
 */

export interface RuleContext {
  pages: ParsedPage[];
  fetches: Map<string, FetchRecord>;
  referrers: Map<string, Referrer[]>;
  startPageUrl: string;
}

type Rule = (ctx: RuleContext) => Finding[];

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

function sample(items: string[], max = 5): string[] {
  if (items.length <= max) return items;
  return [...items.slice(0, max), `…and ${items.length - max} more`];
}

interface RuleMeta {
  ruleId: string;
  category: Category;
  severity: Severity;
  confidenceBasis: ConfidenceBasis;
  effort: Finding["effort"];
}

function make(meta: RuleMeta, rest: Omit<Finding, keyof RuleMeta | "ruleVersion">): Finding {
  return { ...meta, ruleVersion: RULESET_VERSION, ...rest };
}

const isOk = (s: number) => s >= 200 && s < 300;

/* ---------------- CLY-001: missing page title ---------------- */
const titleMissing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && !p.title);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-001", category: "SEO & discoverability", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page has no usable title" : `${bad.length} pages have no usable title`,
        explanation:
          "These pages have no <title> element, or it is empty. The title is what search engines and browser tabs show, and what gets pasted when the page is shared.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — <title> ${p.title === null ? "missing" : "empty"}`)),
        recommendation: "Give every page a unique, descriptive title (roughly 30–60 characters) that names the page's topic and the business.",
        impactRationale:
          "Observed fact: the title element is absent or empty in the served HTML. Titles affect how listings appear in search results; this scan can't measure any ranking or traffic effect.",
      },
    ),
  ];
};

/* ---------------- CLY-002: duplicate titles ---------------- */
const titleDuplicate: Rule = ({ pages }) => {
  const groups = new Map<string, string[]>();
  for (const p of pages) {
    if (!isOk(p.status) || !p.title) continue;
    groups.set(p.title, [...(groups.get(p.title) ?? []), p.url]);
  }
  const dupes = [...groups.entries()].filter(([, urls]) => urls.length > 1);
  if (!dupes.length) return [];
  return [
    make(
      { ruleId: "CLY-002", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: "Site-wide",
        title: `${dupes.length} page title${dupes.length > 1 ? "s are" : " is"} reused across pages`,
        explanation:
          "Multiple pages share the exact same <title>, so visitors and search engines can't tell them apart in results, tabs, or history.",
        evidence: sample(
          dupes.map(([t, urls]) => `“${t}” on ${urls.map(pathOf).join(", ")}`),
          3,
        ),
        recommendation: "Make each page's title describe that specific page.",
        impactRationale: "Observed fact from the crawled pages' titles. Only pages within the crawl limit were compared.",
      },
    ),
  ];
};

/* ---------------- CLY-003: missing meta description ---------------- */
const metaDescriptionMissing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && !p.metaDescription);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-003", category: "SEO & discoverability", severity: "medium", confidenceBasis: "confirmed", effort: "Hours" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page has no meta description" : `${bad.length} pages have no meta description`,
        explanation:
          "Without a meta description, search engines auto-generate the snippet under the page's search result from arbitrary page text.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — no <meta name="description">`)),
        recommendation: "Write a unique 140–160 character description for each page summarising what that page offers.",
        impactRationale:
          "Observed fact: the tag is absent in the served HTML. Descriptions influence which snippet searchers see; they don't directly change rankings.",
      },
    ),
  ];
};

/* ---------------- CLY-007: no detectable primary action (heuristic) ---------------- */
const CTA_PATTERN =
  /\b(contact|book|get started|sign ?up|register|buy|shop|call|quote|demo|trial|subscribe|order|enquire|inquire|appointment|consult|join|download|apply|request)\b/i;

const primaryActionNotDetected: Rule = ({ pages, startPageUrl }) => {
  const start = pages.find((p) => p.url === startPageUrl);
  if (!start || !isOk(start.status)) return [];
  if (start.forms.length > 0) return []; // a form is itself a primary action
  const matches = start.actionTexts.filter((t) => CTA_PATTERN.test(t));
  if (matches.length > 0) return [];
  return [
    make(
      { ruleId: "CLY-007", category: "Conversion", severity: "medium", confidenceBasis: "heuristic", effort: "Hours" },
      {
        page: pathOf(start.url),
        title: "No clear primary call-to-action detected on the landing page",
        explanation:
          "The submitted page contains no links, buttons, or forms whose wording matches common calls to action (contact, book, sign up, get a quote, and similar). Visitors may have no obvious next step.",
        evidence: [
          `${start.actionTexts.length} link/button label(s) inspected; 0 matched common call-to-action wording`,
          "No <form> present on the page",
          "Note: icon-only buttons and JavaScript-rendered controls aren't visible to this HTTP-level scan",
        ],
        recommendation:
          "Review the page visually. If there's no obvious primary action above the fold, add one clear, specific action (e.g. “Book a consultation”) near the headline.",
        impactRationale:
          "Heuristic only: wording patterns can't prove design intent. Flagged for human review, not stated as a confirmed problem.",
      },
    ),
  ];
};

/* ---------------- CLY-018: unlabelled form fields ---------------- */
const formLabelsMissing: Rule = ({ pages }) => {
  const hits: { page: string; fields: string[] }[] = [];
  for (const p of pages) {
    const fields = p.forms.flatMap((f) => f.unlabelledFields);
    if (fields.length) hits.push({ page: p.url, fields });
  }
  const total = hits.reduce((n, h) => n + h.fields.length, 0);
  if (!total) return [];
  return [
    make(
      { ruleId: "CLY-018", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: hits.length === 1 ? pathOf(hits[0].page) : `Site-wide (${hits.length} pages)`,
        title: `${total} form field${total > 1 ? "s have" : " has"} no associated label`,
        explanation:
          "These inputs have no <label> linked by for/id, aren't wrapped in a label, and have no aria-label. Screen readers can't announce them properly, and placeholder-only prompts disappear once typing starts.",
        evidence: sample(hits.flatMap((h) => h.fields.map((f) => `${f} on ${pathOf(h.page)}`))),
        recommendation: "Add visible <label> elements linked to each field with for/id (keep placeholders as examples only).",
        impactRationale:
          "Observed fact from the form markup. Labelled fields reduce form errors and are required for assistive technology to work correctly.",
      },
    ),
  ];
};

/* ---------------- CLY-023: broken internal links ---------------- */
const brokenInternalLinks: Rule = ({ fetches, referrers }) => {
  const findings: Finding[] = [];
  for (const [url, rec] of fetches) {
    if (rec.status !== 404 && rec.status !== 410) continue;
    if (rec.kind === "form-action" || rec.kind === "robots") continue;
    const refs = referrers.get(url) ?? [];
    if (!refs.length) continue; // only report links we actually saw on a page
    findings.push(
      make(
        { ruleId: "CLY-023", category: "Reliability", severity: "high", confidenceBasis: "confirmed", effort: "Minutes" },
        {
          page: pathOf(url),
          title: `Broken internal link: ${pathOf(url)} returns ${rec.status}`,
          explanation: `A link on the site points to ${pathOf(url)}, and the server responded ${rec.status} when we requested it. Visitors clicking it reach a dead end.`,
          evidence: [
            `GET ${pathOf(url)} → HTTP ${rec.status}`,
            ...sample(
              refs.map((r) => `Linked from ${pathOf(r.from)}${r.anchorText ? ` (anchor text: “${r.anchorText}”)` : ""}`),
              3,
            ),
          ],
          recommendation: "Update the link to the page's current URL, restore the page, or add a redirect from the old address.",
          impactRationale: "Confirmed by a direct HTTP request during this scan — not inferred.",
        },
      ),
    );
  }
  return findings;
};

/* ---------------- CLY-031: images missing alt attributes ---------------- */
const imgAltMissing: Rule = ({ pages }) => {
  const hits = pages.filter((p) => p.imagesMissingAlt.length > 0);
  const total = hits.reduce((n, p) => n + p.imagesMissingAlt.length, 0);
  if (!total) return [];
  return [
    make(
      { ruleId: "CLY-031", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Hours" },
      {
        page: hits.length === 1 ? pathOf(hits[0].url) : `Site-wide (${hits.length} pages)`,
        title: `${total} image${total > 1 ? "s are" : " is"} missing the alt attribute`,
        explanation:
          "These <img> elements have no alt attribute at all, so screen-reader users get no description. (Images with alt=\"\" — the correct markup for purely decorative images — were not counted.)",
        evidence: sample(
          hits.flatMap((p) => p.imagesMissingAlt.map((src) => `${src} on ${pathOf(p.url)}`)),
          6,
        ),
        recommendation: "Add short descriptive alt text to content images; keep purely decorative images as alt=\"\" (ideally with aria-hidden).",
        impactRationale: "Observed fact from the page markup. Accessibility is a correctness issue independent of conversion.",
      },
    ),
  ];
};

/* ---------------- CLY-041: form destination returns 404/410 (GET check) ---------------- */
const formDestinationBroken: Rule = ({ pages, fetches }) => {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    for (const form of p.forms) {
      if (!form.action) continue;
      let dest: string;
      try {
        dest = new URL(form.action, p.url).href;
      } catch {
        continue;
      }
      const rec = fetches.get(dest);
      if (!rec || (rec.status !== 404 && rec.status !== 410)) continue;
      const key = `${p.url}→${dest}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isGetForm = form.method === "get";
      findings.push(
        make(
          { ruleId: "CLY-041", category: "Conversion", severity: "high", confidenceBasis: "confirmed", effort: "Minutes" },
          {
            page: pathOf(p.url),
            title: `Form destination ${pathOf(dest)} returns ${rec.status}`,
            explanation: isGetForm
              ? `The form on this page submits with GET to ${pathOf(dest)}, which returned HTTP ${rec.status} — the same request a visitor's submission would start with.`
              : `The form on this page points to ${pathOf(dest)}, which returned HTTP ${rec.status} to our safe GET check. We never submit forms, so a POST-only handler might still work — but post-submission confirmation pages often live at this address, so verify the full flow.`,
            evidence: [
              `Form found on ${pathOf(p.url)} (method="${form.method}", action="${form.action}")`,
              `GET ${pathOf(dest)} → HTTP ${rec.status}`,
              "Clyvro did not submit the form or send any data",
            ],
            recommendation:
              "Submit a test entry through the live form. If visitors see an error, restore the destination page or update the form's action to the current URL.",
            impactRationale: isGetForm
              ? "Confirmed: the exact destination of a GET form submission returns an error status."
              : "Confirmed observation (GET returns an error) with an inference caveat: submissions use POST, which we deliberately don't perform. Treat as 'verify urgently', not as proof of lost submissions.",
          },
        ),
      );
    }
  }
  return findings;
};

/* ---------------- CLY-050: missing viewport meta ---------------- */
const viewportMissing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && !p.hasViewport);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-050", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page has no mobile viewport declaration" : `${bad.length} pages have no mobile viewport declaration`,
        explanation:
          "Without <meta name=\"viewport\">, mobile browsers typically render the page at desktop width and shrink it, making text and tap targets very small.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — no <meta name="viewport">`)),
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head and verify the layout at a small width.',
        impactRationale: "Observed fact: the tag is absent. How badly the page renders on phones depends on its CSS, which this rule doesn't assess.",
      },
    ),
  ];
};

/* ---------------- CLY-051: sensitive form over plain HTTP ---------------- */
const insecureForm: Rule = ({ pages }) => {
  const hits: string[] = [];
  for (const p of pages) {
    for (const form of p.forms) {
      if (!form.hasPassword && !form.hasEmail) continue;
      let actionUrl: URL | null = null;
      try {
        actionUrl = new URL(form.action ?? p.url, p.url);
      } catch { /* unparseable action — covered by other means */ }
      const pageInsecure = p.url.startsWith("http://");
      const actionInsecure = actionUrl?.protocol === "http:";
      if (pageInsecure || actionInsecure) {
        hits.push(
          `${form.hasPassword ? "Password" : "Email"} form on ${pathOf(p.url)} → action "${form.action ?? "(same page)"}" (${actionInsecure ? "http destination" : "served over http"})`,
        );
      }
    }
  }
  if (!hits.length) return [];
  return [
    make(
      { ruleId: "CLY-051", category: "Reliability", severity: "high", confidenceBasis: "confirmed", effort: "Hours" },
      {
        page: "Site-wide",
        title: "Sensitive form data would travel over unencrypted HTTP",
        explanation:
          "A form collecting passwords or email addresses is served over plain HTTP or submits to an http:// address, so the data crosses the network unencrypted.",
        evidence: sample(hits, 4),
        recommendation: "Serve the page over HTTPS and point the form action at an https:// URL; redirect all http:// traffic to HTTPS.",
        impactRationale: "Observed fact from the page and form URLs. Browsers also warn visitors about insecure password fields, which directly undermines trust at signup/login.",
      },
    ),
  ];
};

/* ---------------- CLY-060: missing H1 ---------------- */
const h1Missing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.h1Count === 0);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-060", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page has no H1 heading" : `${bad.length} pages have no H1 heading`,
        explanation: "No <h1> element was found in the served HTML, so the page's main heading isn't marked up as one for search engines and assistive technology.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — 0 <h1> elements`)),
        recommendation: "Mark the page's main heading as a single <h1>.",
        impactRationale: "Detection is a fact; the practical impact varies by page, so this is low severity and grouped as housekeeping.",
      },
    ),
  ];
};

/* ---------------- CLY-061: missing html lang ---------------- */
const langMissing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && !p.lang);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-061", category: "Accessibility", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page doesn't declare its language" : `${bad.length} pages don't declare their language`,
        explanation: "The <html> element has no lang attribute, so screen readers can't reliably choose correct pronunciation and browsers can't offer translation confidently.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — <html> has no lang attribute`)),
        recommendation: 'Add the appropriate language code, e.g. <html lang="en">.',
        impactRationale: "Observed fact from the markup; a quick correctness fix.",
      },
    ),
  ];
};

export const RULES: Rule[] = [
  titleMissing,
  titleDuplicate,
  metaDescriptionMissing,
  primaryActionNotDetected,
  formLabelsMissing,
  brokenInternalLinks,
  imgAltMissing,
  formDestinationBroken,
  viewportMissing,
  insecureForm,
  h1Missing,
  langMissing,
];

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Which selectable audit type each rule belongs to (Phase 3). "generic"
 * always runs the full set. New rules must be registered here.
 */
export const RULE_AUDIT_TYPES: Record<string, "technical-seo" | "accessibility" | "conversion-ux" | "security-config"> = {
  "CLY-001": "technical-seo",
  "CLY-002": "technical-seo",
  "CLY-003": "technical-seo",
  "CLY-023": "technical-seo",
  "CLY-060": "technical-seo",
  "CLY-018": "accessibility",
  "CLY-031": "accessibility",
  "CLY-050": "accessibility",
  "CLY-061": "accessibility",
  "CLY-007": "conversion-ux",
  "CLY-041": "conversion-ux",
  "CLY-051": "security-config",
};

export type RuleAuditType = (typeof RULE_AUDIT_TYPES)[string] | "generic";

export function runRules(ctx: RuleContext, auditTypes?: string[]): Finding[] {
  const all = RULES.flatMap((rule) => rule(ctx));
  const filtered =
    !auditTypes?.length || auditTypes.includes("generic")
      ? all
      : all.filter((f) => auditTypes.includes(RULE_AUDIT_TYPES[f.ruleId] ?? "generic"));
  return filtered.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId) || a.page.localeCompare(b.page),
  );
}
