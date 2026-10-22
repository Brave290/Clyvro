/**
 * Rendered flow scanning — shared types + pure content builders.
 * Server-free so the client page and the server engine produce
 * byte-identical exports. Steps/notes are facts the browser observed;
 * nothing here simulates a result.
 */

export interface FlowStep {
  at: string;
  label: string;
  level: "step" | "note" | "error";
  detail?: string;
  /** Latest viewport JPEG (data URI). Only the newest step keeps one so the poll payload stays small. */
  preview?: string;
}

export function latestPreview(steps: FlowStep[]): string | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const p = steps[i]?.preview;
    if (p) return p;
  }
  return undefined;
}

/** Keep only the newest preview on the latest step so the polled JSON stays small. */
export function attachLivePreview(steps: FlowStep[], dataUri: string): void {
  for (const s of steps) delete s.preview;
  const last = steps[steps.length - 1];
  if (last) last.preview = dataUri;
}

export interface FlowPageResult {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string | null;
  renderedWords: number;
  forms: number;
  buttons: number;
  internalLinks: number;
  /** Wall-clock render time for this page (navigation → settled DOM). Optional (pre-upgrade reports). */
  durationMs?: number;
  /** Lab web-vitals from this single headless load (NOT field/CrUX data). Optional. */
  vitals?: { ttfbMs: number | null; lcpMs: number | null; cls: number | null };
  /** Small JPEG thumbnail of the rendered page (data URI), captured for every visited page. Optional (absent if the capture exceeded the byte cap). */
  screenshot?: string;
  /** Same, at the 390×844 phone viewport — the mobile pass renders every visited page, so each page carries its own. Optional. */
  screenshotMobile?: string;
}

export interface UiDiscrepancy {
  id: string;
  /** flaw = measured layout/UX defect; note = worth a human look. */
  level: "flaw" | "note";
  title: string;
  evidence: string;
  recommendation: string;
}

export interface FlowFinding {
  ruleId: string;
  severity: string;
  title: string;
  page: string;
}

export interface FlowReport {
  targetUrl: string;
  startedAt: string;
  durationMs: number;
  pages: FlowPageResult[];
  consoleErrors: { page: string; text: string }[];
  failedRequests: { page: string; url: string; failure: string }[];
  notes: string[];
  tech: string[];
  limitations: string[];
  /** UI discrepancies measured in the rendered page (CTA placement, tap targets, overflow…). Optional for pre-upgrade reports. */
  uiDiscrepancies?: UiDiscrepancy[];
  /** Ruleset 6.5 findings computed on the RENDERED DOM. Optional for pre-upgrade reports. */
  findings?: FlowFinding[];
  /** AI-pattern read of the rendered start page. Optional for pre-upgrade reports. */
  aiPattern?: { score: number; band: string; topSignals: string[] } | null;
  /**
   * Requests cancelled mid-flight (net::ERR_ABORTED) — usually route
   * prefetches the browser dropped while navigating on. Recorded for
   * transparency, but NOT failures: the page they belonged to never
   * needed them. Optional for pre-upgrade reports.
   */
  cancelledRequests?: { count: number; examples: string[] };
}

/**
 * The agent's task plan for a flow scan — the checklist the browser
 * container ticks off as steps stream in (Manus-style: a visible plan,
 * each item derived from REAL steps, never a fake animation). A phase
 * is "done" when a later phase has begun or the run finished; "active"
 * when it's the furthest phase reached while running.
 */
export interface FlowPlanPhase {
  id: string;
  label: string;
  state: "done" | "active" | "todo" | "stopped";
}

const PHASE_DEFS: { id: string; label: string; match: RegExp }[] = [
  { id: "open", label: "Open the site in a real browser", match: /Starting a real browser|Browser started|Opening the start page/i },
  { id: "measure", label: "Measure the rendered layout — CTA, tap targets, overflow", match: /Rendered “|UI (flaw|note) on/i },
  { id: "menus", label: "Probe menus & navigation", match: /Menu probe/i },
  { id: "mobile", label: "Check the phone layout (390px)", match: /phone viewport|Mobile (menu|UI)/i },
  { id: "walk", label: "Walk the site's pages like a visitor", match: /Following link/i },
  { id: "analysis", label: "Run scanner rules + AI-pattern read on the rendered page", match: /AI-pattern read/i },
  { id: "report", label: "Compile the report with fixes", match: /Flow scan complete/i },
];

export function flowPlanPhases(steps: FlowStep[], status: string): FlowPlanPhase[] {
  const terminal = status === "completed" || status === "failed";
  const firstHit = PHASE_DEFS.map((p) => steps.findIndex((s) => p.match.test(s.label)));
  const furthest = firstHit.reduce((max, v) => Math.max(max, v), -1);
  return PHASE_DEFS.map((p, i) => {
    const hit = firstHit[i];
    let state: FlowPlanPhase["state"];
    if (hit === -1) state = terminal && status === "failed" ? "stopped" : "todo";
    else if (status === "completed") state = "done";
    else if (hit < furthest) state = "done";
    else if (terminal) state = status === "failed" ? "stopped" : "done";
    else state = "active";
    return { id: p.id, label: p.label, state };
  });
}

/**
 * Classify a failed browser request. An ERR_ABORTED is the browser
 * cancelling an in-flight request (navigation moved on, component
 * unmounted) — for Next.js `?_rsc=` prefetches this is routine. It is
 * not evidence the resource can't load, so it must never be reported
 * as a failed request. Everything else is a real failure.
 */
export function classifyRequestFailure(failure: string, _url: string): "cancelled" | "failed" {
  void _url;
  return /ERR_ABORTED/i.test(failure) ? "cancelled" : "failed";
}

/** Raw interactive-element measurements collected inside the browser. */
export interface UiMeasurements {
  viewportWidth: number;
  viewportHeight: number;
  scrollWidth: number;
  elements: {
    text: string;
    ariaLabel: string | null;
    x: number; y: number; width: number; height: number;
    isCta: boolean;
  }[];
}

const CTA_RE = /\b(contact|book|get started|sign ?up|register|buy|shop|call|quote|demo|trial|subscribe|order|enquire|inquire|appointment|consult|join|download|apply|request|start|try|see plans|pricing)\b/i;
export const isCtaText = (text: string) => CTA_RE.test(text);

/**
 * Turn measured geometry into UI discrepancies. Every item is computed
 * from the rendered page's actual bounding boxes — a flaw is a
 * measurement (e.g. a 12px-tall tap target), never a taste opinion,
 * and each one carries its fix.
 */
export function analyzeUiMeasurements(m: UiMeasurements): UiDiscrepancy[] {
  const out: UiDiscrepancy[] = [];
  const fold = m.elements.filter((e) => e.y < m.viewportHeight && e.y + e.height > 0);
  const foldCtas = fold.filter((e) => e.isCta);

  if (m.elements.length > 0 && foldCtas.length === 0) {
    out.push({
      id: "no-cta-in-fold",
      level: "flaw",
      title: "No call-to-action in the first screenful",
      evidence: `${fold.length} interactive element(s) are visible before scrolling, and none reads as a call-to-action (book/contact/sign up/get started…). The primary action only appears after scrolling.`,
      recommendation: "Put ONE primary CTA in the first viewport, next to the headline, labelled with its destination and payoff (e.g. “Book a consultation”, not “Click here”). Everything else competes below it.",
    });
  }
  if (foldCtas.length > 4) {
    out.push({
      id: "competing-ctas",
      level: "note",
      title: `${foldCtas.length} competing calls-to-action above the fold`,
      evidence: `First screenful CTAs: ${foldCtas.slice(0, 6).map((e) => `“${(e.text || e.ariaLabel || "unlabelled").slice(0, 30)}”`).join(", ")}.`,
      recommendation: "Pick the single action this page exists for and make it visually dominant; demote the rest to plain links. Five equal buttons read as no button.",
    });
  }
  const small = m.elements.filter((e) => e.width < 24 || e.height < 24);
  if (small.length > 0) {
    out.push({
      id: "small-tap-targets",
      level: "flaw",
      title: `${small.length} tap target(s) smaller than 24×24px`,
      evidence: small.slice(0, 5).map((e) => `“${(e.text || e.ariaLabel || "unlabelled").slice(0, 24)}” at ${Math.round(e.width)}×${Math.round(e.height)}px`).join("; ") + ".",
      recommendation: "Grow interactive targets to at least 24×24px (44×44px is the comfortable touch standard) with padding — fingers are wider than mouse pointers, and missed taps read as a broken site.",
    });
  }
  if (m.scrollWidth > m.viewportWidth + 1) {
    out.push({
      id: "horizontal-overflow",
      level: "flaw",
      title: "Page is wider than the screen (horizontal scrolling)",
      evidence: `Document scroll width ${m.scrollWidth}px vs viewport ${m.viewportWidth}px — something (a wide table, image, or fixed-width block) pushes ${m.scrollWidth - m.viewportWidth}px off-screen.`,
      recommendation: "Find the overflowing element (wide tables, 100vw blocks with scrollbars, unmaxed images) and constrain it: max-width: 100%, overflow-x handling, or responsive stacking.",
    });
  }
  const empty = m.elements.filter((e) => !e.text.trim() && !(e.ariaLabel ?? "").trim());
  if (empty.length > 0) {
    out.push({
      id: "empty-interactive",
      level: "flaw",
      title: `${empty.length} interactive element(s) with no label at all`,
      evidence: "Buttons/links with neither visible text nor an aria-label — screen readers announce “button”, and sighted users get an unexplained icon.",
      recommendation: "Give every control a name: visible text where possible, or aria-label for icon-only buttons (e.g. aria-label=\"Open menu\").",
    });
  }
  // Overlapping interactive elements (bounding boxes intersecting >40% of the smaller).
  let overlaps = 0;
  const els = m.elements;
  for (let i = 0; i < els.length && overlaps < 3; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      const inter = ix * iy;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (smaller > 0 && inter / smaller > 0.4) overlaps++;
    }
  }
  if (overlaps > 0) {
    out.push({
      id: "overlapping-interactive",
      level: "note",
      title: "Interactive elements overlap each other",
      evidence: `${overlaps} overlapping pair(s) of buttons/links measured on the rendered page — usually a fixed banner, chat widget or sticky bar sitting on top of real controls.`,
      recommendation: "Check sticky headers, cookie banners and chat widgets at this viewport size: they should push content or dismiss, never cover the controls beneath them.",
    });
  }
  return out;
}

export const FLOW_LIMITATIONS = [
  "The browser never submits forms, never enters data, and never clicks purchase, delete, sign-out or unsubscribe actions.",
  "Only same-origin pages are visited (a bounded sample), and every navigation is re-checked as public before it happens.",
  "A quiet console on the visited pages is good news, not a guarantee: errors that only occur after login or complex interactions aren't reached.",
  "Web-vitals shown are lab values from one headless load (useful for spotting slowness, not a substitute for real-user field data), and contrast sampling judges computed colours only — text over photos or gradients needs a human eye.",
];

export function flowScanToMarkdown(report: FlowReport, steps: FlowStep[]): string {
  const lines: string[] = [];
  lines.push(`# Rendered flow scan — ${report.targetUrl}`);
  lines.push("");
  lines.push(`- Ran: ${report.startedAt} (${(report.durationMs / 1000).toFixed(1)}s) in a real headless browser with JavaScript on`);
  lines.push(`- Pages rendered: ${report.pages.length} · console errors: ${report.consoleErrors.length} · failed requests: ${report.failedRequests.length}`);
  if (report.tech.length) lines.push(`- Technology visible after rendering: ${report.tech.join(", ")}`);
  lines.push("");
  lines.push("## Pages visited");
  for (const p of report.pages) {
    lines.push(`- ${p.finalUrl} — HTTP ${p.status ?? "no response"} — “${p.title ?? "no title"}” · ${p.renderedWords} rendered words · ${p.forms} form(s) · ${p.buttons} button(s) · ${p.internalLinks} internal link(s)${p.durationMs != null ? ` · rendered in ${(p.durationMs / 1000).toFixed(1)}s` : ""}${p.vitals ? ` · lab vitals (single headless load, not field data): TTFB ${p.vitals.ttfbMs ?? "—"}ms, LCP ${p.vitals.lcpMs ?? "—"}ms, CLS ${p.vitals.cls ?? "—"}` : ""}`);
  }
  const discrepancies = report.uiDiscrepancies ?? [];
  if (discrepancies.length) {
    lines.push("");
    lines.push("## UI discrepancies (measured in the rendered page)");
    for (const d of discrepancies) {
      lines.push(`- [${d.level === "flaw" ? "FLAW" : "NOTE"}] ${d.title}`);
      lines.push(`  Evidence: ${d.evidence}`);
      lines.push(`  Fix: ${d.recommendation}`);
    }
  }
  const findings = report.findings ?? [];
  if (findings.length) {
    lines.push("");
    lines.push("## Scanner findings on the rendered DOM (latest ruleset)");
    for (const f of findings) lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} (${f.page})`);
  }
  if (report.cancelledRequests?.count) {
    lines.push("");
    lines.push(`_Transparency: ${report.cancelledRequests.count} request(s) were cancelled mid-flight by navigation (net::ERR_ABORTED) — e.g. ${report.cancelledRequests.examples[0] ?? "a route prefetch"}. That's normal browser behaviour, not a failure, so they're excluded above._`);
  }
  if (report.aiPattern) {
    lines.push("");
    lines.push(`## AI-pattern read of the rendered page: ${report.aiPattern.score}/100 (${report.aiPattern.band})`);
    if (report.aiPattern.topSignals.length) lines.push(`Top generic-pattern signals: ${report.aiPattern.topSignals.join("; ")}`);
  }
  lines.push("");
  lines.push("## Live step log");
  for (const s of steps) lines.push(`- [${s.level.toUpperCase()}] ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
  if (report.consoleErrors.length) {
    lines.push("");
    lines.push("## Browser console errors");
    for (const e of report.consoleErrors) lines.push(`- ${e.page}: ${e.text}`);
  }
  if (report.failedRequests.length) {
    lines.push("");
    lines.push("## Failed requests");
    for (const f of report.failedRequests) lines.push(`- ${f.url} — ${f.failure} (on ${f.page})`);
  }
  if (report.notes.length) {
    lines.push("");
    lines.push("## Notes");
    for (const n of report.notes) lines.push(`- ${n}`);
  }
  lines.push("");
  lines.push("## Limitations");
  for (const l of report.limitations) lines.push(`- ${l}`);
  lines.push("");
  lines.push("---");
  lines.push("Generated by Clyvro — See what's broken. Fix it fast. Observed in a real browser session; re-run after fixing to verify.");
  return lines.join("\n");
}

export function flowScanToAgentPrompt(report: FlowReport, steps: FlowStep[]): string {
  const lines: string[] = [];
  lines.push(`You are fixing runtime problems found by a rendered flow scan of ${report.targetUrl} (Clyvro, Playwright). A real headless browser rendered the site with JavaScript on, visited ${report.pages.length} page(s), and recorded what actually happened. Work only from these observations.`);
  lines.push("");
  lines.push("Rules:");
  lines.push("1. Verify each item in the current codebase before changing anything; if you can't reproduce it, say so instead of guessing.");
  lines.push("2. Fix measured FLAWS and console errors first — those are visitors' real breakages. Do not silence errors by removing features.");
  lines.push("3. Show diffs and wait for my approval before committing or publishing.");
  lines.push("");
  const flaws = (report.uiDiscrepancies ?? []).filter((d) => d.level === "flaw");
  if (flaws.length) {
    lines.push("UI flaws measured in the rendered page (geometry, not opinion):");
    for (const d of flaws) {
      lines.push(`- ${d.title}. Evidence: ${d.evidence} Fix: ${d.recommendation}`);
    }
    lines.push("");
  }
  const findings = report.findings ?? [];
  if (findings.length) {
    lines.push("Scanner findings on the rendered DOM (latest ruleset):");
    for (const f of findings.slice(0, 15)) lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} (${f.page})`);
    lines.push("");
  }
  if (report.consoleErrors.length) {
    lines.push("Browser console errors observed:");
    for (const e of report.consoleErrors) lines.push(`- ${e.page}: ${e.text}`);
    lines.push("");
  }
  if (report.failedRequests.length) {
    lines.push("Requests that failed during the visit:");
    for (const f of report.failedRequests) lines.push(`- ${f.url} — ${f.failure} (on ${f.page})`);
    lines.push("");
  }
  const errSteps = steps.filter((s) => s.level === "error" || s.level === "note");
  if (errSteps.length) {
    lines.push("Notes from the live run:");
    for (const s of errSteps) lines.push(`- ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
    lines.push("");
  }
  const uiNotes = (report.uiDiscrepancies ?? []).filter((d) => d.level === "note");
  if (uiNotes.length) {
    lines.push("UI notes worth a human look:");
    for (const d of uiNotes) lines.push(`- ${d.title}. Evidence: ${d.evidence} Suggestion: ${d.recommendation}`);
    lines.push("");
  }
  if (!report.consoleErrors.length && !report.failedRequests.length && !errSteps.length && !flaws.length && !findings.length) {
    lines.push("The run was clean: no UI flaws, no console errors, no failed requests, no navigation failures on the pages visited. No fixes requested — confirm nothing regressed in the last deploy.");
    return lines.join("\n");
  }
  lines.push("When done, summarize each fix (file + change) and how it can be verified in a browser. I will re-run the flow scan to confirm.");
  return lines.join("\n");
}
