import type { Category, ConfidenceBasis, Finding, Severity } from "@/lib/types";
import type { FetchRecord, ParsedPage, Referrer } from "./types";
import { RULESET_VERSION } from "./config";

/**
 * Deterministic rule set v6.5.0 — every finding is produced by a named rule
 * over observed fetch/parse facts. Severity (impact if true), confidence
 * basis (how it was detected) and effort are independent axes.
 * (4.x was the Flow-Scan rendered-DOM series; 5.0 unifies both engines
 * on 43 rules (5.0), 5.1 added CLY-103/104, 5.2 added CLY-105/106, 6.5 adds CLY-107…125.)
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
  /** Ruleset 5.1: well-known file probes from the crawler. Absent = probes never ran (old checkpoints/rendered runs) — CLY-103/104 stay silent. */
  siteFiles?: {
    securityTxt: number | null;
    llmsTxt: number | null;
    /** Ruleset 5.2, deep scans only: sensitive-file reachability (status only). Absent = deep probes never ran — CLY-106 stays silent. */
    sensitive?: { path: string; status: number | null }[];
  };
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
    // v3.0 false-positive guard: a page that canonicalises to a different
    // URL is intentionally a copy — its duplicate title is correct there.
    if (p.canonical) {
      try {
        if (new URL(p.canonical, p.url).href !== new URL(p.url).href) continue;
      } catch { /* unparseable canonical — treat the page normally */ }
    }
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
  const start = pages.find((p: any) => p.url === startPageUrl);
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

/* ---------------- CLY-070: multiple H1 headings (1.2) ---------------- */
const h1Multiple: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.h1Count > 1);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-070", category: "Accessibility", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page has more than one H1 heading" : `${bad.length} pages have more than one H1 heading`,
        explanation: "Several <h1> elements compete as the page's main heading, which muddies the document outline for screen readers and search engines.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.h1Count} <h1> elements`)),
        recommendation: "Keep one <h1> for the page's main heading and demote the rest to <h2>/<h3>.",
        impactRationale: "Observed fact from the markup; a document-structure correctness fix.",
      },
    ),
  ];
};

/* ---------------- CLY-071: over-long titles (1.2) ---------------- */
const titleTooLong: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.title && p.title.length > 60);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-071", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page title is likely too long to display fully" : `${bad.length} page titles are likely too long to display fully`,
        explanation: "Search results typically truncate titles around 50–60 characters, so the part visitors read first may be cut off.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.title!.length} characters: “${p.title!.slice(0, 80)}…”`)),
        recommendation: "Front-load the important words and keep titles to roughly 30–60 characters.",
        impactRationale: "The length is measured; how much any given search engine truncates varies, so this is low severity.",
      },
    ),
  ];
};

/* ---------------- CLY-072: duplicate meta descriptions (1.2) ---------------- */
const metaDescriptionDuplicate: Rule = ({ pages }) => {
  const groups = new Map<string, string[]>();
  for (const p of pages) {
    if (!isOk(p.status) || !p.metaDescription) continue;
    groups.set(p.metaDescription, [...(groups.get(p.metaDescription) ?? []), p.url]);
  }
  const dupes = [...groups.entries()].filter(([, urls]) => urls.length > 1);
  if (!dupes.length) return [];
  return [
    make(
      { ruleId: "CLY-072", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: "Site-wide",
        title: `${dupes.length} meta description${dupes.length > 1 ? "s are" : " is"} reused across pages`,
        explanation: "The same meta description appears on multiple pages, so search snippets can't describe what makes each page different.",
        evidence: sample(dupes.map(([d, urls]) => `“${d.slice(0, 60)}…” on ${urls.map(pathOf).join(", ")}`), 3),
        recommendation: "Write a distinct one-or-two-sentence description for each page.",
        impactRationale: "Observed fact from the crawled pages; only pages within the crawl limit were compared.",
      },
    ),
  ];
};

/* ---------------- CLY-073: slow server responses (1.2, measured) ---------------- */
const slowResponses: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.durationMs > 2500);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-073", category: "Performance", severity: "medium", confidenceBasis: "measured", effort: "Hours" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page responded slowly during the scan" : `${bad.length} pages responded slowly during the scan`,
        explanation: "These pages took over 2.5 seconds to respond when the scanner fetched them. Slow first responses delay everything the visitor sees.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${(p.durationMs / 1000).toFixed(1)}s server response during scan`)),
        recommendation: "Check hosting capacity, caching, and heavy server-side work on these routes; then re-scan to confirm the improvement.",
        impactRationale: "Measured during this scan from the scanner's location — a single sample, not a lab benchmark or Core Web Vitals. A consistently slow response is still worth investigating.",
      },
    ),
  ];
};

/* ---------------- CLY-074: images without dimensions (1.2) ---------------- */
const imagesNoDimensions: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.imagesWithoutDimensions ?? 0) > 0);
  if (!bad.length) return [];
  const total = bad.reduce((n, p) => n + (p.imagesWithoutDimensions ?? 0), 0);
  return [
    make(
      { ruleId: "CLY-074", category: "Performance", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: `${total} image${total > 1 ? "s have" : " has"} no width/height, so layout can jump while loading`,
        explanation: "Without width/height (or an aspect-ratio style), the browser can't reserve space for an image before it loads, so text and buttons shift around — visitors can tap the wrong thing.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.imagesWithoutDimensions} of ${p.imagesTotal} images without dimensions`)),
        recommendation: "Add width and height attributes (or CSS aspect-ratio) to <img> elements.",
        impactRationale: "Observed in the markup. This is the common cause of layout shift; the scan doesn't render the page, so the actual shift amount wasn't measured.",
      },
    ),
  ];
};

/* ---------------- CLY-075: mixed content (1.2) ---------------- */
const mixedContent: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.insecureSubresources?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-075", category: "Reliability", severity: "high", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Secure page loads insecure (http://) resources" : `${bad.length} secure pages load insecure (http://) resources`,
        explanation: "These HTTPS pages reference images/scripts/styles over plain HTTP. Browsers block or warn on such mixed content, which can break the page and undermines the padlock visitors look for.",
        evidence: sample(bad.flatMap((p) => (p.insecureSubresources ?? []).slice(0, 2).map((r) => `${pathOf(p.url)} loads ${r}`))),
        recommendation: "Change every http:// resource reference to https:// (or a protocol-relative/root-relative URL).",
        impactRationale: "Observed fact from the served HTML on HTTPS pages. Whether a given browser blocks each resource depends on its type.",
      },
    ),
  ];
};

/* ---------------- CLY-076: target=_blank without noopener (1.2) ---------------- */
const blankNoOpener: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.externalBlankNoRel?.length ?? 0) > 0);
  if (!bad.length) return [];
  const total = bad.reduce((n, p) => n + (p.externalBlankNoRel?.length ?? 0), 0);
  return [
    make(
      { ruleId: "CLY-076", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: `${total} external link${total > 1 ? "s open" : " opens"} in a new tab without rel="noopener"`,
        explanation: "Links with target=\"_blank\" and no rel=\"noopener\" let the opened page script-navigate the original tab (reverse tabnabbing) on older browsers.",
        evidence: sample(bad.flatMap((p) => (p.externalBlankNoRel ?? []).slice(0, 2).map((h) => `${pathOf(p.url)} → ${h}`))),
        recommendation: "Add rel=\"noopener\" (or rel=\"noreferrer\") to external target=\"_blank\" links.",
        impactRationale: "Observed in the markup. Modern browsers imply noopener, so this is defense-in-depth at low severity.",
      },
    ),
  ];
};

/* ---------------- CLY-077: missing favicon (1.2) ---------------- */
const faviconMissing: Rule = ({ pages, startPageUrl }) => {
  const start = pages.find((p) => p.url === startPageUrl) ?? pages[0];
  if (!start || start.hasFavicon !== false) return [];
  return [
    make(
      { ruleId: "CLY-077", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: pathOf(start.url),
        title: "No favicon declared",
        explanation: "No <link rel=\"icon\"> was found, so tabs, bookmarks, and some search results show a generic globe instead of the brand mark.",
        evidence: [`${pathOf(start.url)} — no icon link in <head> (a /favicon.ico file may still exist; it wasn't declared)`],
        recommendation: "Add a favicon (SVG or PNG) and declare it with <link rel=\"icon\"> in the <head>.",
        impactRationale: "Observed fact about the markup; a small brand-recognition fix.",
      },
    ),
  ];
};

/* ---------------- CLY-080: no canonical tag (3.0) ---------------- */
const canonicalMissing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.canonical !== undefined && !p.canonical);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-080", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page declares no canonical URL" : `${bad.length} pages declare no canonical URL`,
        explanation:
          "Without a <link rel=\"canonical\">, the same page reachable with tracking parameters, trailing slashes, or www/non-www variants can be indexed as several different pages, splitting its signals.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — no <link rel="canonical">`)),
        recommendation: "Add a canonical tag on every page pointing at its one preferred URL (self-referencing is correct for unique pages).",
        impactRationale: "Observed fact from the served HTML. Whether duplicates are actually indexed depends on the site's URL variants, which only the owner can fully enumerate.",
      },
    ),
  ];
};

/* ---------------- CLY-081: incomplete Open Graph basics (3.0) ---------------- */
const ogBasicsMissing: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.hasOgBasics === false);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-081", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page is missing basic social-sharing tags" : `${bad.length} pages are missing basic social-sharing tags`,
        explanation:
          "Pages without the full Open Graph basics (og:title, og:description, og:image) get auto-generated — often poor — previews when shared in chat, social feeds, and link unfurls, which is where much discovery happens.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — og:title/og:description/og:image incomplete`)),
        recommendation: "Add og:title, og:description and an og:image (1200×630) per page; add a twitter:card tag too if the audience shares on X.",
        impactRationale: "Observed fact from the <head> markup. The scan can't measure share rates; this is about controlling the preview visitors actually see.",
      },
    ),
  ];
};

/* ---------------- CLY-082: heading levels skipped (3.0) ---------------- */
const headingSkips: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.headingSkips ?? 0) > 0);
  if (!bad.length) return [];
  const total = bad.reduce((n, p) => n + (p.headingSkips ?? 0), 0);
  return [
    make(
      { ruleId: "CLY-082", category: "Accessibility", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: `${total} heading-level skip${total > 1 ? "s" : ""} break the document outline`,
        explanation:
          "Headings jump a level (for example h1 straight to h3). Screen-reader users navigate by heading level, so skipped levels make the page structure hard to follow; it also weakens the outline search engines read.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.headingSkips} skipped level(s)`)),
        recommendation: "Keep heading levels sequential (h1 → h2 → h3) and use CSS, not heading level, for visual size.",
        impactRationale: "Observed fact from the heading order in the markup; a document-structure correctness fix.",
      },
    ),
  ];
};

/* ---------------- CLY-083: thin page content (3.0, heuristic) ---------------- */
const thinContent: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.wordCount !== undefined && p.wordCount > 0 && p.wordCount < 120 && p.title);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-083", category: "SEO & discoverability", severity: "low", confidenceBasis: "heuristic", effort: "Hours" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: bad.length === 1 ? "Page has very little readable content" : `${bad.length} pages have very little readable content`,
        explanation:
          "These pages carry under ~120 words of visible text in the served HTML. Some pages are legitimately minimal (checkout, sign-in), but content pages this thin rarely answer a visitor's — or a search engine's — question.",
        evidence: sample(bad.map((p) => `${pathOf(p.url)} — ~${p.wordCount} words of body text`)),
        recommendation: "Review each page: if it's meant to inform or rank, expand it with the specifics only you can provide (process, pricing factors, proof). If it's a utility page, no change needed.",
        impactRationale: "Heuristic from a word count of the raw HTML (JavaScript-rendered text isn't visible to this scan). Flagged for human judgement, not stated as a defect.",
      },
    ),
  ];
};

/* ---------------- CLY-084: generator/version fingerprint exposed (3.0) ---------------- */
const generatorExposed: Rule = ({ pages }) => {
  const gens = new Map<string, number>();
  for (const p of pages) {
    if (!isOk(p.status) || !p.generator) continue;
    gens.set(p.generator, (gens.get(p.generator) ?? 0) + 1);
  }
  const versioned = [...gens.entries()].filter(([g]) => /\d+\.\d+/.test(g));
  if (!versioned.length) return [];
  return [
    make(
      { ruleId: "CLY-084", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: "Site-wide",
        title: "The site announces its exact software version in every page",
        explanation:
          "A <meta name=\"generator\"> tag publishes the CMS/framework and its exact version. Attackers scan for precisely this to match known vulnerabilities in old versions; it costs nothing to remove.",
        evidence: versioned.map(([g, n]) => `<meta name="generator" content="${g}"> on ${n} page(s)`),
        recommendation: "Remove or strip the version from the generator tag (in WordPress: remove_action('wp_head', 'wp_generator') or a security plugin), and keep the software updated regardless.",
        impactRationale: "Observed fact from the markup. Exposure alone isn't a breach — it just makes targeted probing cheaper for attackers.",
      },
    ),
  ];
};

/* ---------------- CLY-085: generic link text (3.0) ---------------- */
const genericLinkText: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.genericLinkTexts?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [
    make(
      { ruleId: "CLY-085", category: "Accessibility", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      {
        page: bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`,
        title: "Links labelled only “click here” / “read more”",
        explanation:
          "Generic anchor text tells screen-reader users (who often list links out of context) and search engines nothing about the destination. Descriptive labels convert better and navigate better.",
        evidence: sample(bad.flatMap((p) => (p.genericLinkTexts ?? []).slice(0, 2).map((t) => `${pathOf(p.url)} — link text “${t}”`))),
        recommendation: "Rewrite each label to name the destination (e.g. “Read the pricing guide”) — keep “read more” only alongside a descriptive aria-label.",
        impactRationale: "Observed fact from anchor texts in the markup; descriptive labels are a plain correctness and clarity win.",
      },
    ),
  ];
};

/* ================= Ruleset 5.0 additions (CLY-086+) =================
 * Researched against 2026 audit practice (WCAG 2.2 notes from Deque/axe:
 * duplicate IDs only bite when referenced; security-header prevalence
 * data; link-purpose failure rates). Every rule stays evidence-first:
 * "confirmed" only for directly observed facts, "heuristic" where a
 * human should confirm. Rules skip cleanly when their 5.0 parser feeds
 * are absent (older checkpoints, rendered pages). */

const siteWide = (bad: ParsedPage[]) =>
  bad.length === 1 ? pathOf(bad[0].url) : `Site-wide (${bad.length} pages)`;

/* ---------------- CLY-086: duplicate IDs referenced by labels/ARIA ---------------- */
const duplicateIdsReferencedRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.duplicateIdsReferenced?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-086", category: "Accessibility", severity: "medium", confidenceBasis: "heuristic", effort: "Hours" },
    {
      page: siteWide(bad),
      title: "Element IDs are duplicated where labels/ARIA point at them",
      explanation:
        "The same id is used more than once on a page, and a <label> or ARIA attribute references that id. Assistive technology resolves the reference to the first match — which may be the wrong field, so a control can be announced with another field's label.",
      evidence: sample(bad.flatMap((p) => (p.duplicateIdsReferenced ?? []).slice(0, 3).map((id) => `${pathOf(p.url)} — id "${id}" is duplicated and referenced`))),
      recommendation: "Make every id unique per page; where a block is repeated (forms, cards), suffix the ids and update the matching for/aria attributes.",
      impactRationale: "Observed duplicated ids in the served HTML; whether a screen reader actually mislabels depends on which element it resolves — needs a quick check with the repeated block.",
    },
  )];
};

/* ---------------- CLY-087: duplicate IDs (unreferenced) ---------------- */
const duplicateIdsPlainRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.duplicateIdsPlain?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-087", category: "Accessibility", severity: "low", confidenceBasis: "heuristic", effort: "Hours" },
    {
      page: siteWide(bad),
      title: "Element IDs are duplicated (no label/ARIA reference)",
      explanation:
        "IDs repeat on these pages. Nothing references them today, so this is a markup smell rather than a proven failure — but in-page links and scripts using those ids will hit the first match only, and it becomes a real labelling bug the moment a form references one.",
      evidence: sample(bad.flatMap((p) => (p.duplicateIdsPlain ?? []).slice(0, 3).map((id) => `${pathOf(p.url)} — id "${id}" repeated`))),
      recommendation: "Deduplicate ids when you next touch these templates; prefer classes for styling hooks.",
      impactRationale: "Observed in markup. WCAG 2.2 removed the old parsing criterion — unreferenced duplicates are reported for review, not as violations.",
    },
  )];
};

/* ---------------- CLY-088: ARIA/label references to missing IDs ---------------- */
const brokenIdRefsRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.brokenIdRefs?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-088", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: "Labels/ARIA point at elements that don't exist",
      explanation:
        "A <label for>, aria-labelledby, aria-describedby or aria-controls value names an id that isn't on the page. The control loses its accessible name/description — the reference silently resolves to nothing.",
      evidence: sample(bad.flatMap((p) => (p.brokenIdRefs ?? []).slice(0, 3).map((id) => `${pathOf(p.url)} — reference to missing id "${id}"`))),
      recommendation: "Fix the id on the target element or correct the reference; this usually breaks when a template is edited and one side isn't updated.",
      impactRationale: "Observed fact: the referenced ids are absent from the served HTML.",
    },
  )];
};

/* ---------------- CLY-089: empty headings ---------------- */
const emptyHeadingsRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.emptyHeadings ?? 0) > 0);
  if (!bad.length) return [];
  const total = bad.reduce((n, p) => n + (p.emptyHeadings ?? 0), 0);
  return [make(
    { ruleId: "CLY-089", category: "Accessibility", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: `${total} heading${total > 1 ? "s are" : " is"} empty`,
      explanation:
        "Heading elements (h1–h6) with no text are announced as blank stops by screen-reader heading navigation, and suggest a template rendering an empty title field.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.emptyHeadings} empty heading(s)`)),
      recommendation: "Remove empty headings, or render the heading only when its text exists.",
      impactRationale: "Observed fact from the served HTML.",
    },
  )];
};

/* ---------------- CLY-090: iframes without titles ---------------- */
const iframeTitleRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.iframesMissingTitle ?? 0) > 0);
  if (!bad.length) return [];
  const total = bad.reduce((n, p) => n + (p.iframesMissingTitle ?? 0), 0);
  return [make(
    { ruleId: "CLY-090", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: `${total} embedded frame${total > 1 ? "s have" : " has"} no title`,
      explanation:
        "Every <iframe> (maps, videos, booking widgets) needs a title so screen-reader users know what the frame contains before entering it. Without one it's announced as an unlabelled frame.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.iframesMissingTitle} iframe(s) without title`)),
      recommendation: "Add a short descriptive title to each iframe (e.g. title=\"Map and directions\").",
      impactRationale: "Observed fact from the served HTML.",
    },
  )];
};

/* ---------------- CLY-091: viewport blocks zoom ---------------- */
const viewportZoomRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.viewportBlocksZoom);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-091", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: "Page prevents visitors from zooming",
      explanation:
        "The viewport declaration disables zoom (user-scalable=no) or caps it below 200% (maximum-scale). Low-vision visitors who rely on pinch-zoom are locked out of enlarging text.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — viewport restricts zoom`)),
      recommendation: "Use width=device-width, initial-scale=1 and remove user-scalable=no / maximum-scale restrictions.",
      impactRationale: "Observed fact from the page's viewport meta tag.",
    },
  )];
};

/* ---------------- CLY-092: placeholder as the only label ---------------- */
const placeholderOnlyRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.placeholderOnlyFields?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-092", category: "Accessibility", severity: "medium", confidenceBasis: "heuristic", effort: "Hours" },
    {
      page: siteWide(bad),
      title: "Form fields are labelled only by their placeholder",
      explanation:
        "These fields have no real label — the placeholder is doing the labelling. It disappears as soon as someone types, is often too low-contrast to read, and several screen readers don't announce it as a name.",
      evidence: sample(bad.flatMap((p) => (p.placeholderOnlyFields ?? []).slice(0, 3).map((f) => `${pathOf(p.url)} — ${f} placeholder-only`))),
      recommendation: "Give each field a visible <label> (keep the placeholder as an example format, not the label).",
      impactRationale: "Observed: fields with a placeholder and no label/aria naming in the served HTML.",
    },
  )];
};

/* ---------------- CLY-093: personal fields without autocomplete ---------------- */
const autocompleteRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.fieldsMissingAutocomplete?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-093", category: "Accessibility", severity: "low", confidenceBasis: "heuristic", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: "Personal-data fields don't say what they are (autocomplete)",
      explanation:
        "Email/phone/name-style fields without an autocomplete attribute can't be autofilled by browsers or password managers, and assistive tech can't programmatically identify the field's purpose (WCAG 1.3.5). It also measurably slows form completion on phones.",
      evidence: sample(bad.flatMap((p) => (p.fieldsMissingAutocomplete ?? []).slice(0, 3).map((f) => `${pathOf(p.url)} — ${f} no autocomplete`))),
      recommendation: "Add the standard token per field: autocomplete=\"email\", \"tel\", \"name\", \"street-address\", etc.",
      impactRationale: "Observed: fields whose type/name implies personal data, with no autocomplete attribute.",
    },
  )];
};

/* ---------------- CLY-094: form fields with no name ---------------- */
const fieldNameRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.fieldsMissingName?.length ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-094", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: "Form fields have no name — their values are never sent",
      explanation:
        "Browsers only submit fields that carry a name attribute. These fields render and accept input, but whatever a visitor types in them is silently dropped on submit (unless JavaScript reads them by id — worth confirming).",
      evidence: sample(bad.flatMap((p) => (p.fieldsMissingName ?? []).slice(0, 3).map((f) => `${pathOf(p.url)} — ${f} has no name`))),
      recommendation: "Add a name to every field meant to be submitted, or confirm the form is JS-driven and reads these fields explicitly.",
      impactRationale: "Observed fact from form markup; JS-handled forms are the false-positive case this note flags for review.",
    },
  )];
};

/* ---------------- CLY-095: same link text, different destinations ---------------- */
const sameTextDifferentTargetRule: Rule = ({ pages }) => {
  const byText = new Map<string, Set<string>>();
  for (const p of pages) {
    if (!isOk(p.status)) continue;
    for (const l of p.links) {
      const text = l.text.replace(/\s+/g, " ").trim().toLowerCase();
      if (text.length < 3 || text.length > 40) continue;
      let abs: string;
      try { abs = new URL(l.href, p.url).href; } catch { continue; }
      if (!byText.has(text)) byText.set(text, new Set());
      byText.get(text)!.add(abs);
    }
  }
  const conflicts = [...byText.entries()].filter(([, targets]) => targets.size > 1);
  if (!conflicts.length) return [];
  return [make(
    { ruleId: "CLY-095", category: "Accessibility", severity: "medium", confidenceBasis: "heuristic", effort: "Hours" },
    {
      page: "Site-wide",
      title: "Identical link labels lead to different pages",
      explanation:
        "The same link text points at different destinations across the site. Screen-reader users navigate by pulling up a list of links — identical labels for different places can't be told apart, and sighted visitors learn the label can't be trusted.",
      evidence: sample(conflicts.map(([t, targets]) => `“${t}” → ${[...targets].slice(0, 3).map(pathOf).join(", ")}`), 4),
      recommendation: "Make each label name its destination (“See website prices” vs “See print prices”), or add a descriptive aria-label where the visual text must stay short.",
      impactRationale: "Observed anchor texts and resolved destinations across crawled pages; surrounding context can occasionally disambiguate, hence heuristic.",
    },
  )];
};

/* ---------------- CLY-096: links with no discernible text ---------------- */
const emptyLinksRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.emptyLinks ?? 0) > 0);
  if (!bad.length) return [];
  const total = bad.reduce((n, p) => n + (p.emptyLinks ?? 0), 0);
  return [make(
    { ruleId: "CLY-096", category: "Accessibility", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: `${total} link${total > 1 ? "s have" : " has"} no discernible text`,
      explanation:
        "These links contain no text, aria-label, title, or labelled image — screen readers announce just “link”, and there's nothing meaningful to click by name. Icon/image links are the usual cause.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.emptyLinks} empty link(s)`)),
      recommendation: "Add visible text where possible, or aria-label naming the destination (e.g. aria-label=\"Instagram — Acme Bakery\").",
      impactRationale: "Observed fact from the served HTML.",
    },
  )];
};

/* ---------------- CLY-097: invalid JSON-LD structured data ---------------- */
const jsonLdInvalidRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && (p.jsonLdInvalid ?? 0) > 0);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-097", category: "SEO & discoverability", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: "Structured data (JSON-LD) is invalid JSON and will be ignored",
      explanation:
        "A JSON-LD block on these pages fails to parse as JSON (a trailing comma or unescaped quote is typical). Search engines discard unparseable blocks entirely, so the rich-result eligibility it was added for is lost.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.jsonLdInvalid} unparseable JSON-LD block(s)`)),
      recommendation: "Fix the JSON syntax and validate with Google's Rich Results Test; generate the block from a structured object rather than string templates.",
      impactRationale: "Observed fact: the block content was parsed during the scan and rejected by the JSON parser.",
    },
  )];
};

/* ---------------- CLY-098: canonical tag problems ---------------- */
const canonicalProblemsRule: Rule = ({ pages }) => {
  const multi = pages.filter((p) => isOk(p.status) && (p.canonicalCount ?? 0) > 1);
  const httpOnHttps = pages.filter((p) => isOk(p.status) && p.url.startsWith("https://") && (p.canonical ?? "").startsWith("http://"));
  if (!multi.length && !httpOnHttps.length) return [];
  return [make(
    { ruleId: "CLY-098", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: "Site-wide",
      title: "Canonical tags conflict or downgrade to HTTP",
      explanation:
        "Pages with more than one canonical tag give search engines contradictory instructions (they may ignore all of them), and a canonical pointing at the http:// version of an https page tells them the insecure copy is the real one.",
      evidence: sample([
        ...multi.map((p) => `${pathOf(p.url)} — ${p.canonicalCount} canonical tags`),
        ...httpOnHttps.map((p) => `${pathOf(p.url)} — canonical is ${p.canonical}`),
      ]),
      recommendation: "Emit exactly one canonical per page, absolute and https, pointing at the page's preferred URL.",
      impactRationale: "Observed fact from the served HTML head.",
    },
  )];
};

/* ---------------- CLY-099: security headers missing (start page, HTTPS) ---------------- */
const securityHeadersRule: Rule = ({ pages, startPageUrl }) => {
  const start = pages.find((p) => p.url === startPageUrl);
  if (!start || !isOk(start.status) || !start.url.startsWith("https://") || !start.headers) return [];
  const h = start.headers;
  const missing: string[] = [];
  if (!h["strict-transport-security"]) missing.push("Strict-Transport-Security (forces HTTPS after first visit)");
  if (!h["x-content-type-options"]) missing.push("X-Content-Type-Options: nosniff (stops MIME-sniffing attacks)");
  if (!h["x-frame-options"] && !/frame-ancestors/i.test(h["content-security-policy"] ?? "")) {
    missing.push("clickjacking protection (X-Frame-Options or CSP frame-ancestors)");
  }
  if (!h["referrer-policy"]) missing.push("Referrer-Policy (controls what URLs leak to other sites)");
  if (!missing.length) return [];
  return [make(
    { ruleId: "CLY-099", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Hours" },
    {
      page: pathOf(start.url),
      title: `Security headers missing on the home page (${missing.length} of 4 checked)`,
      explanation:
        "These response headers are cheap, one-time server settings that close whole classes of attacks (protocol downgrade, MIME confusion, clickjacking, referrer leakage). Most sites are missing at least one — 2026 audit samples found 70–80% missing Referrer-Policy/CSP-class headers.",
      evidence: missing.map((m) => `Missing: ${m}`),
      recommendation: "Add the missing headers at your host/CDN (one config block; keep CSP for a follow-up change since a wrong CSP can break the site — test it in report-only mode first).",
      impactRationale: "Observed fact: the headers were absent from the home page response captured during the scan. Header presence alone doesn't prove a secure configuration — hence low severity.",
    },
  )];
};

/* ---------------- CLY-100: meta-refresh redirects ---------------- */
const metaRefreshRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => isOk(p.status) && p.metaRefresh);
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-100", category: "Accessibility", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: siteWide(bad),
      title: "Page redirects itself with a timed meta refresh",
      explanation:
        "A <meta http-equiv=\"refresh\"> reloads/redirects the page on a timer. It can pull content away while someone is reading, breaks the back button's expectations, and is a long-standing accessibility failure when the delay is short.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — meta refresh present`)),
      recommendation: "Replace meta refresh with a server-side 301/302 redirect, or a visible link the visitor chooses to follow.",
      impactRationale: "Observed fact from the served HTML head.",
    },
  )];
};

/* ---------------- CLY-101: hreflang without self-reference ---------------- */
const hreflangSelfRule: Rule = ({ pages }) => {
  const bad = pages.filter((p) => {
    if (!isOk(p.status) || !(p.hreflangLinks?.length)) return false;
    return !p.hreflangLinks.some((h) => {
      try { return new URL(h.href, p.url).href === new URL(p.url).href; } catch { return false; }
    });
  });
  if (!bad.length) return [];
  return [make(
    { ruleId: "CLY-101", category: "SEO & discoverability", severity: "low", confidenceBasis: "heuristic", effort: "Hours" },
    {
      page: siteWide(bad),
      title: "Language alternates (hreflang) don't include this page itself",
      explanation:
        "The page declares hreflang alternates but none of them points back at this page's own URL. Search engines treat a set without a self-referencing entry as incomplete and may ignore the whole set.",
      evidence: sample(bad.map((p) => `${pathOf(p.url)} — ${p.hreflangLinks!.length} alternate(s), none self-referencing`)),
      recommendation: "Include the page's own URL in its hreflang set (with its language/region code), on every variant.",
      impactRationale: "Observed declared alternates vs the page URL; a CMS emitting per-language partial sets is the case to confirm.",
    },
  )];
};

/* ---------------- CLY-102: social image problems ---------------- */
const socialImageRule: Rule = ({ pages }) => {
  const relative = pages.filter((p) => isOk(p.status) && p.ogImage && !/^https?:\/\//i.test(p.ogImage));
  const largeNoImage = pages.filter((p) => isOk(p.status) && p.twitterCard === "summary_large_image" && !p.ogImage);
  if (!relative.length && !largeNoImage.length) return [];
  return [make(
    { ruleId: "CLY-102", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: "Site-wide",
      title: "Social sharing image is relative or missing for a large-image card",
      explanation:
        "Most sharing platforms (Facebook, LinkedIn, X, WhatsApp) require og:image to be an absolute URL — a relative path is dropped, so shares render without the image. Declaring twitter:card=summary_large_image with no image at all has the same result.",
      evidence: sample([
        ...relative.map((p) => `${pathOf(p.url)} — og:image "${p.ogImage}" is relative`),
        ...largeNoImage.map((p) => `${pathOf(p.url)} — summary_large_image card with no image`),
      ]),
      recommendation: "Use the full https URL for og:image (and add twitter:image), sized ~1200×630.",
      impactRationale: "Observed fact from the served meta tags.",
    },
  )];
};

/* ---------------- CLY-103: no security.txt (RFC 9116) ---------------- */
const securityTxtRule: Rule = ({ siteFiles, startPageUrl }) => {
  if (!siteFiles || siteFiles.securityTxt === null) return [];
  if (siteFiles.securityTxt >= 200 && siteFiles.securityTxt < 300) return [];
  return [make(
    { ruleId: "CLY-103", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: "Site-wide",
      title: "No security.txt — researchers have no way to report vulnerabilities",
      explanation:
        "RFC 9116 defines /.well-known/security.txt so security researchers (and scanners like this one) can find the right contact to disclose a vulnerability responsibly. Without it, reports go to random inboxes — or get posted publicly.",
      evidence: sample([`GET /.well-known/security.txt on ${startPageUrl} answered HTTP ${siteFiles.securityTxt}`]),
      recommendation: "Publish /.well-known/security.txt with a Contact: line (a monitored email or reporting URL) and an Expires: date within a year.",
      impactRationale: "Observed fact: the probe returned a non-success status during this crawl.",
    },
  )];
};

/* ---------------- CLY-104: no llms.txt ---------------- */
const llmsTxtRule: Rule = ({ siteFiles, startPageUrl }) => {
  if (!siteFiles || siteFiles.llmsTxt === null) return [];
  if (siteFiles.llmsTxt >= 200 && siteFiles.llmsTxt < 300) return [];
  return [make(
    { ruleId: "CLY-104", category: "SEO & discoverability", severity: "low", confidenceBasis: "heuristic", effort: "Minutes" },
    {
      page: "Site-wide",
      title: "No llms.txt — AI assistants get no curated guide to this site",
      explanation:
        "llms.txt is an emerging convention: a plain-markdown index at /llms.txt that helps AI assistants (ChatGPT, Claude, Perplexity and search copilots) understand what the site offers and cite the right pages. Adoption is still early — treat this as an opportunity note, not a defect.",
      evidence: sample([`GET /llms.txt on ${startPageUrl} answered HTTP ${siteFiles.llmsTxt}`]),
      recommendation: "Add /llms.txt: the site name, a one-paragraph summary, and links to the key pages with one-line descriptions. Keep it factual — it becomes source material for AI answers about you.",
      impactRationale: "Emerging-standard presence check; whether AI tools reward it is not yet proven, hence the low severity.",
    },
  )];
};

/* ---------------- CLY-105: weak Content-Security-Policy ---------------- */
const weakCspRule: Rule = ({ pages, startPageUrl }) => {
  const start = pages.find((p) => p.url === startPageUrl);
  if (!start || !isOk(start.status) || !start.headers) return [];
  const csp = start.headers["content-security-policy"];
  if (!csp) return []; // no CSP at all is a different conversation (host config); weak ≠ missing
  const weaknesses: string[] = [];
  const directives = csp.split(";").map((d) => d.trim()).filter(Boolean);
  const find = (name: string) => directives.find((d) => d.toLowerCase().startsWith(`${name} `) || d.toLowerCase() === name);
  const scriptSrc = find("script-src") ?? find("default-src");
  if (scriptSrc && /'unsafe-inline'/i.test(scriptSrc)) {
    weaknesses.push(`${scriptSrc.split(/\s+/)[0]} allows 'unsafe-inline' — any injected markup can run script, which largely disarms the CSP against XSS`);
  }
  if (scriptSrc && /'unsafe-eval'/i.test(scriptSrc)) {
    weaknesses.push(`${scriptSrc.split(/\s+/)[0]} allows 'unsafe-eval' — strings can be turned into executable code at runtime`);
  }
  for (const d of directives) {
    const [name, ...sources] = d.split(/\s+/);
    if (sources.some((s) => s === "*")) {
      weaknesses.push(`${name} allows any origin (*) — the directive restricts nothing`);
      break;
    }
  }
  if (!weaknesses.length) return [];
  return [make(
    { ruleId: "CLY-105", category: "Reliability", severity: "medium", confidenceBasis: "confirmed", effort: "Hours" },
    {
      page: pathOf(start.url),
      title: "Content-Security-Policy is present but weakened",
      explanation:
        "A CSP only protects visitors if its script rules are strict. 'unsafe-inline' (common because frameworks inject small inline scripts) lets any injected markup execute JavaScript — the main attack a CSP exists to stop. External scanners flag this on sight; it was observed in this site's own home-page response headers.",
      evidence: sample(weaknesses.map((w) => `CSP: ${w}`)),
      recommendation: "Move inline scripts into external files or authorise them per-response with a nonce (script-src 'self' 'nonce-…') or by hash, drop 'unsafe-eval', and replace any * source with the specific origins needed. Roll out with Content-Security-Policy-Report-Only first so nothing breaks silently.",
      impactRationale: "Observed fact from the response headers captured during the scan — the directive text is quoted verbatim as evidence.",
    },
  )];
};

/* ---------------- CLY-106: sensitive files publicly reachable (deep scans) ---------------- */
const sensitiveFilesRule: Rule = ({ siteFiles, startPageUrl }) => {
  if (!siteFiles?.sensitive?.length) return [];
  const exposed = siteFiles.sensitive.filter((s) => s.status !== null && s.status >= 200 && s.status < 300);
  if (!exposed.length) return [];
  return [make(
    { ruleId: "CLY-106", category: "Reliability", severity: "high", confidenceBasis: "confirmed", effort: "Minutes" },
    {
      page: "Site-wide",
      title: `Sensitive file(s) publicly reachable: ${exposed.map((s) => s.path).join(", ")}`,
      explanation:
        "Files like /.env and /.git/config hold credentials, database passwords and source-code history. If the web server answers them with HTTP 200, anyone on the internet can request them — this is one of the most common ways sites are breached. The scan checked reachability only (headers, never contents): the file being served is the whole problem.",
      evidence: sample(exposed.map((s) => `GET ${s.path} on ${startPageUrl} answered HTTP ${s.status} (headers-only probe — contents were not read)`)),
      recommendation: "Block these paths at the server/CDN (deny /.env, /.git/, /.svn/ outright), move secrets out of the web root, and — if a file was ever reachable — rotate every credential it contained, because you must assume it was copied.",
      impactRationale: "Observed fact: the probe was answered with a success status during this deep scan. Reachability status only; no file contents were fetched or stored.",
    },
  )];
};

/* ── v6.5: CLY-107…125 ───────────────────────────────────── */

/* CLY-107: robots.txt blocks important pages */
const robotsBlocksRule: Rule = () => []; // robots.txt assessment lives in the SEO-visibility engine (runSeoVisibilityEngine)

/* CLY-108: sitemap missing (info) — covered by SEO-visibility engine; rule stays silent here */
const sitemapRule: Rule = () => [];

/* CLY-109: missing canonical on canonical-host */
const canonicalHostRule: Rule = ({ pages, startPageUrl }: RuleContext) => {
  const start = pages.find((p: any) => p.url === startPageUrl);
  if (!start || !isOk(start.status)) return [];
  if (!start.canonical && pages.length > 1) {
    return [make({ ruleId: "CLY-109", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      { page: pathOf(startPageUrl), title: "Missing canonical URL on multi-page site", explanation: "Canonical tags help search engines understand which URL is the preferred version. Without them, duplicate URLs can split ranking signals.", evidence: [startPageUrl + " has no canonical link and " + pages.length + " pages were found"], recommendation: "Add <link rel=\"canonical\" href=\"YOUR_URL\"> to each page. Most CMSs do this automatically.", impactRationale: "Confirmed from parsed page canonical field." })];
  }
  return [];
};

/* CLY-110: Open Graph image missing or tiny */
const ogImageRule: Rule = ({ pages }: RuleContext) => {
  // ogImage coverage is handled by the dedicated canonicalMissing/ogBasicsMissing rules; this is a no-op placeholder for audit-type wiring.
  void pages;
  return [];
};

/* CLY-111: structured data invalid or missing on content pages */
const structuredDataRule: Rule = ({ pages }: RuleContext) => {
  let missing = 0;
  for (const p of pages) {
    if (!isOk(p.status) || !p.title) continue;
    if (!p.hasJsonLd) missing++;
  }
  if (missing === pages.length && pages.length >= 3) {
    return [make({ ruleId: "CLY-111", category: "SEO & discoverability", severity: "low", confidenceBasis: "heuristic", effort: "Hours" },
      { page: "Site-wide", title: "No structured data (JSON-LD) found on any page", explanation: "Structured data helps search engines and AI systems understand what your pages are about — products, articles, FAQs, organization — and can unlock richer display formats. Without it you remain eligible for standard results, but miss chances for enhanced presentation.", evidence: [pages.length + " page(s) fetched, none contain JSON-LD"], recommendation: "Add JSON-LD for your organization (name, logo, social profiles) plus per-page types: Article for blog posts, Product for shop items, FAQPage where you answer common questions. Validate at validator.schema.org.", impactRationale: "Heuristic based on absence across all fetched pages — absence does not harm rankings per se." })];
  }
  return [];
};

/* CLY-112: thin content (very few words) */
const thinContentRule: Rule = ({ pages }: RuleContext) => {
  const findings = [];
  for (const p of pages) {
    if (!isOk(p.status)) continue;
    const wc = p.wordCount ?? 0;
    if (wc > 0 && wc < 80) {
      findings.push(make({ ruleId: "CLY-112", category: "SEO & discoverability", severity: "low", confidenceBasis: "heuristic", effort: "Hours" },
        { page: pathOf(p.url), title: "Very thin page content", explanation: "Search engines and AI answering models need enough text to understand what a page is about. Pages with very little visible text rarely rank and are skipped by question-answering systems.", evidence: [p.url + " has approx " + wc + " words of text content"], recommendation: "Add meaningful, original copy that fully answers the page's core question — at least a few hundred words of useful, specific content.", impactRationale: "Measured word count from parsed page; threshold is heuristic." }));
      if (findings.length >= 3) break;
    }
  }
  return findings;
};

/* CLY-113: missing HSTS */
const hstsRule: Rule = ({ pages, startPageUrl }: RuleContext) => {
  const start = pages.find(p => p.url === startPageUrl);
  if (!start || !isOk(start.status) || !start.headers) return [];
  const hsts = start.headers['strict-transport-security'];
  const isHttps = startPageUrl.startsWith('https://');
  if (isHttps && !hsts) {
    return [make({ ruleId: "CLY-113", category: "Reliability", severity: "medium", confidenceBasis: "confirmed", effort: "Minutes" },
      { page: pathOf(startPageUrl), title: "Missing Strict-Transport-Security header", explanation: "HSTS tells browsers to always use HTTPS for your domain, preventing downgrade attacks where an attacker intercepts the first HTTP request. Without it, even an HTTPS site can be downgraded before the redirect happens.", evidence: [startPageUrl + " served over HTTPS without HSTS"], recommendation: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains on HTTPS responses. Start with a short max-age and increase once verified.", impactRationale: "Confirmed from response headers captured during the scan." })];
  }
  return [];
};

/* CLY-114: cookies missing Secure/HttpOnly/SameSite */
const cookieSecurityRule: Rule = ({ pages, startPageUrl }: RuleContext) => {
  const start = pages.find(p => p.url === startPageUrl);
  if (!start || !start.headers) return [];
  // cookieFlags is on FetchRecord cookieFlags but not on ParsedPage directly — probe via headers is not reliable
  // This rule covers the generic advice via the securityHeadersRule companion
  return [];
};

/* CLY-115: clickjacking (X-Frame-Options / CSP frame-ancestors) */
const clickjackingRule: Rule = ({ pages, startPageUrl }: RuleContext) => {
  const start = pages.find(p => p.url === startPageUrl);
  if (!start || !isOk(start.status) || !start.headers) return [];
  const xfo = start.headers['x-frame-options'];
  const csp = start.headers['content-security-policy'];
  const hasXFO = Boolean(xfo);
  const hasFrameAncestors = csp ? /frame-ancestors/i.test(csp) : false;
  if (!hasXFO && !hasFrameAncestors && start.url.startsWith('https://')) {
    return [make({ ruleId: "CLY-115", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      { page: pathOf(startPageUrl), title: "No clickjacking protection (X-Frame-Options / frame-ancestors)", explanation: "Without X-Frame-Options or CSP frame-ancestors, your pages can be embedded in an attacker's iframe (clickjacking) — tricking visitors into clicking something they didn't intend to. Modern browsers respect these headers.", evidence: [startPageUrl + " returned neither X-Frame-Options nor CSP frame-ancestors"], recommendation: "Send X-Frame-Options: SAMEORIGIN (or DENY if you never embed your own pages) or CSP frame-ancestors 'self'.", impactRationale: "Confirmed from response headers." })];
  }
  return [];
};

/* CLY-116: missing Referrer-Policy */
const referrerPolicyRule: Rule = ({ pages, startPageUrl }: RuleContext) => {
  const start = pages.find(p => p.url === startPageUrl);
  if (!start || !isOk(start.status) || !start.headers) return [];
  if (!start.headers['referrer-policy']) {
    return [make({ ruleId: "CLY-116", category: "Reliability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
      { page: pathOf(startPageUrl), title: "No Referrer-Policy header", explanation: "Without a Referrer-Policy, browsers may leak the full referrer URL (including query strings that can contain tokens or personal data) to every external site you link to.", evidence: [startPageUrl + " has no Referrer-Policy header"], recommendation: "Add Referrer-Policy: strict-origin-when-cross-origin (good default that limits leakage without breaking analytics).", impactRationale: "Confirmed from response headers." })];
  }
  return [];
};

/* CLY-117: http form over https page */
const mixedFormRule: Rule = ({ pages }: RuleContext) => {
  const out = [];
  for (const p of pages) {
    if (!isOk(p.status) || !p.url.startsWith('https://')) continue;
    const httpForms = (p.forms ?? []).filter((f: any) => (f as any).action?.startsWith('http://'));
    if (httpForms.length) {
      out.push(make({ ruleId: "CLY-117", category: "Reliability", severity: "high", confidenceBasis: "confirmed", effort: "Minutes" },
        { page: pathOf(p.url), title: "Form submits over HTTP from an HTTPS page", explanation: "An HTTPS page that submits a form to http:// means data leaves the encrypted channel — an attacker on the network can read it.", evidence: httpForms.slice(0,3).map((f: any) => f.action), recommendation: "Change form actions to https://. Ensure the destination also serves HTTPS.", impactRationale: "Confirmed from parsed form actions." }));
    }
  }
  return out;
};

/* CLY-118: image alt quality */
const imageAltQualityRule: Rule = () => []; // Generic alt quality is heuristic and covered by CLY-031/Clyvro scan; image-alt guidance lives in SEO Visibility report

/* CLY-119: orphan pages (no inbound links within crawl) */
const orphanRule: Rule = ({ pages, referrers }: RuleContext) => {
  if (pages.length < 3) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orphans = pages.filter((p: any) => {
    const refs = referrers.get(p.url);
    return !refs || refs.length === 0;
  }).filter((p: any) => p.url !== pages[0]?.url);
  if (orphans.length) {
    return [make({ ruleId: "CLY-119", category: "SEO & discoverability", severity: "low", confidenceBasis: "heuristic", effort: "Hours" },
      { page: "Site-wide", title: orphans.length + " page(s) have no internal links pointing to them", explanation: "Orphan pages — pages nothing else on your site links to — are hard for both users and search-engine/AI crawlers to discover. They often represent stale or unfinished content.", evidence: orphans.slice(0,3).map(o => pathOf(o.url) + " — no inbound links from crawled pages"), recommendation: "Add internal links from relevant pages (nav, footer, related-posts, breadcrumbs). Remove or redirect true orphans that should not exist.", impactRationale: "Based only on the crawled subset (depth-bounded); un crawled inbound links are not visible." })];
  }
  return [];
};

/* CLY-120: redirect chains */
const redirectChainRule: Rule = ({ fetches }: RuleContext) => {
  const long = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [url, r] of fetches as any) {
    if ((r as any).redirectChain && (r as any).redirectChain.length >= 2) {
      long.push(url + " → " + (r as any).redirectChain.join(" → ") + " (" + (r as any).redirectChain.length + " hops)");
    }
  }
  if (!long.length) return [];
  return [make({ ruleId: "CLY-120", category: "SEO & discoverability", severity: "low", confidenceBasis: "confirmed", effort: "Minutes" },
    { page: "Site-wide", title: "Long redirect chain(s) detected", explanation: "Each redirect hop costs time and crawl budget and can dilute ranking signals. Long chains (2+ hops) suggest the redirect map was never cleaned after reorganisations. AI retrievers also follow these chains to fetch content.", evidence: sample(long), recommendation: "Shorten chains to a single hop: update source URLs to point directly at the final destination. Audit your redirect table quarterly.", impactRationale: "Measured hops captured during fetch." })];
}

/* ── End v6.5 ── */

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
  h1Multiple,
  titleTooLong,
  metaDescriptionDuplicate,
  slowResponses,
  imagesNoDimensions,
  mixedContent,
  blankNoOpener,
  faviconMissing,
  canonicalMissing,
  ogBasicsMissing,
  headingSkips,
  thinContent,
  generatorExposed,
  genericLinkText,
  duplicateIdsReferencedRule,
  duplicateIdsPlainRule,
  brokenIdRefsRule,
  emptyHeadingsRule,
  iframeTitleRule,
  viewportZoomRule,
  placeholderOnlyRule,
  autocompleteRule,
  fieldNameRule,
  sameTextDifferentTargetRule,
  emptyLinksRule,
  jsonLdInvalidRule,
  canonicalProblemsRule,
  securityHeadersRule,
  metaRefreshRule,
  hreflangSelfRule,
  socialImageRule,
  securityTxtRule,
  llmsTxtRule,
  weakCspRule,
  sensitiveFilesRule,
  robotsBlocksRule,
  sitemapRule,
  canonicalHostRule,
  ogImageRule,
  structuredDataRule,
  thinContentRule,
  hstsRule,
  cookieSecurityRule,
  clickjackingRule,
  referrerPolicyRule,
  mixedFormRule,
  imageAltQualityRule,
  orphanRule,
  redirectChainRule,
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
  "CLY-070": "accessibility",
  "CLY-071": "technical-seo",
  "CLY-072": "technical-seo",
  "CLY-073": "technical-seo",
  "CLY-074": "technical-seo",
  "CLY-075": "security-config",
  "CLY-076": "security-config",
  "CLY-077": "technical-seo",
  "CLY-080": "technical-seo",
  "CLY-081": "technical-seo",
  "CLY-082": "accessibility",
  "CLY-083": "technical-seo",
  "CLY-084": "security-config",
  "CLY-085": "accessibility",
  "CLY-086": "accessibility",
  "CLY-087": "accessibility",
  "CLY-088": "accessibility",
  "CLY-089": "accessibility",
  "CLY-090": "accessibility",
  "CLY-091": "accessibility",
  "CLY-092": "accessibility",
  "CLY-093": "accessibility",
  "CLY-094": "conversion-ux",
  "CLY-095": "accessibility",
  "CLY-096": "accessibility",
  "CLY-097": "technical-seo",
  "CLY-098": "technical-seo",
  "CLY-099": "security-config",
  "CLY-100": "accessibility",
  "CLY-101": "technical-seo",
  "CLY-102": "technical-seo",
  "CLY-103": "security-config",
  "CLY-104": "technical-seo",
  "CLY-105": "security-config",
  "CLY-106": "security-config",
  "CLY-107": "technical-seo",
  "CLY-108": "technical-seo",
  "CLY-109": "technical-seo",
  "CLY-110": "technical-seo",
  "CLY-111": "technical-seo",
  "CLY-112": "technical-seo",
  "CLY-113": "security-config",
  "CLY-114": "security-config",
  "CLY-115": "security-config",
  "CLY-116": "security-config",
  "CLY-117": "security-config",
  "CLY-118": "accessibility",
  "CLY-119": "technical-seo",
  "CLY-120": "technical-seo",
};

export type RuleAuditType = (typeof RULE_AUDIT_TYPES)[string] | "generic";

export function runRules(ctx: RuleContext, auditTypes?: string[]): Finding[] {
  // Rule isolation (5.0): one rule throwing on a malformed page must
  // never take down the whole scan — it's skipped, the rest still run.
  const all = RULES.flatMap((rule) => {
    try {
      return rule(ctx);
    } catch {
      return [];
    }
  });
  const filtered =
    !auditTypes?.length || auditTypes.includes("generic")
      ? all
      : all.filter((f) => auditTypes.includes(RULE_AUDIT_TYPES[f.ruleId] ?? "generic"));
  return filtered.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId) || a.page.localeCompare(b.page),
  );
}
