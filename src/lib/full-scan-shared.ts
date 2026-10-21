/**
 * Full Scan (Pro/Ultra) — the all-in-one bundle. Client-safe types +
 * export builders for the unified report. Per-stage payloads stay
 * deliberately small (headlines + links by id); full detail lives in
 * each engine's own report.
 */

export interface FullStageBase {
  status: "done" | "failed";
  error?: string;
}

export interface FullAuditStage extends FullStageBase {
  score: number | null;
  findings: number;
  pages: number;
  topFindings: { ruleId: string; severity: string; title: string; page: string; recommendation: string }[];
}

export interface FullFlowStage extends FullStageBase {
  scanId: string | null;
  pages: number;
  flaws: { title: string; evidence: string; recommendation: string }[];
  notes: number;
}

export interface FullAiStage extends FullStageBase {
  checkId: string | null;
  score: number;
  band: string;
  topSignals: string[];
}

export interface FullReadinessStage extends FullStageBase {
  checkId: string | null;
  tier: string;
  pass: number;
  warn: number;
  fail: number;
  topFails: string[];
}

export interface FullStages {
  audit?: FullAuditStage;
  flow?: FullFlowStage;
  ai?: FullAiStage;
  readiness?: FullReadinessStage;
}

export interface TopFix {
  source: "Audit" | "Flow Scan" | "AI-Pattern" | "Readiness";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
}

export const STAGE_PLAN: { id: keyof FullStages; label: string }[] = [
  { id: "audit", label: "Rules v5 audit — crawl & check the site" },
  { id: "flow", label: "Flow Scan — walk it in a real browser" },
  { id: "ai", label: "AI-Pattern — generic-ness read of the copy" },
  { id: "readiness", label: "Readiness — stack, hosting, domain & email" },
];

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const asSev = (s: string): TopFix["severity"] =>
  s === "critical" || s === "high" || s === "medium" ? s : "low";

/** Merge every engine's priorities into one ranked fix list. */
export function buildTopFixes(stages: FullStages): TopFix[] {
  const fixes: TopFix[] = [];
  for (const f of stages.audit?.topFindings ?? []) {
    fixes.push({ source: "Audit", severity: asSev(f.severity), title: `${f.title} (${f.ruleId})`, detail: f.recommendation });
  }
  for (const f of stages.flow?.flaws ?? []) {
    fixes.push({ source: "Flow Scan", severity: "high", title: f.title, detail: f.recommendation });
  }
  for (const s of stages.readiness?.topFails ?? []) {
    fixes.push({ source: "Readiness", severity: "medium", title: s, detail: "See the Readiness report for the observed fact and fix." });
  }
  if (stages.ai && stages.ai.score >= 40) {
    fixes.push({
      source: "AI-Pattern", severity: "low",
      title: `Copy reads generic (${stages.ai.score}/100 — ${stages.ai.band})`,
      detail: stages.ai.topSignals.length
        ? `Strongest signals: ${stages.ai.topSignals.join("; ")}. Add specifics only you can say: real numbers, names, places, proof.`
        : "Add specifics only you can say: real numbers, names, places, proof.",
    });
  }
  const seen = new Set<string>();
  return fixes
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .filter((f) => {
      const key = f.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function fullScanToMarkdown(targetUrl: string, stages: FullStages): string {
  const lines: string[] = [];
  lines.push(`# Full Scan — ${targetUrl}`);
  lines.push("");
  lines.push("One run of every Clyvro engine: Rules v5 audit + rendered Flow Scan + AI-Pattern + Project Readiness.");
  lines.push("");
  lines.push("## Scoreboard");
  lines.push(`- Audit (Rules v5): ${stages.audit ? (stages.audit.status === "done" ? `score ${stages.audit.score ?? "—"}/100 · ${stages.audit.findings} finding(s) across ${stages.audit.pages} page(s)` : `failed — ${stages.audit.error}`) : "not run"}`);
  lines.push(`- Flow Scan (real browser): ${stages.flow ? (stages.flow.status === "done" ? `${stages.flow.pages} page(s) rendered · ${stages.flow.flaws.length} UI flaw(s)` : `failed — ${stages.flow.error}`) : "not run"}`);
  lines.push(`- AI-Pattern: ${stages.ai ? (stages.ai.status === "done" ? `${stages.ai.score}/100 (${stages.ai.band})` : `failed — ${stages.ai.error}`) : "not run"}`);
  lines.push(`- Readiness: ${stages.readiness ? (stages.readiness.status === "done" ? `${stages.readiness.tier} tier · ${stages.readiness.pass} pass / ${stages.readiness.warn} warn / ${stages.readiness.fail} fail` : `failed — ${stages.readiness.error}`) : "not run"}`);
  lines.push("");
  lines.push("## Top fixes (merged, most severe first)");
  const fixes = buildTopFixes(stages);
  if (!fixes.length) lines.push("- Nothing urgent surfaced in this run.");
  for (const f of fixes) lines.push(`- [${f.severity.toUpperCase()} · ${f.source}] ${f.title} — ${f.detail}`);
  if (stages.audit?.topFindings.length) {
    lines.push("");
    lines.push("## Audit findings (top)");
    for (const f of stages.audit.topFindings) lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} (${f.page}) — ${f.recommendation}`);
  }
  if (stages.flow?.flaws.length) {
    lines.push("");
    lines.push("## UI flaws measured in the browser");
    for (const f of stages.flow.flaws) lines.push(`- ${f.title}. Evidence: ${f.evidence} Fix: ${f.recommendation}`);
  }
  if (stages.ai?.status === "done" && stages.ai.topSignals.length) {
    lines.push("");
    lines.push(`## AI-pattern signals (${stages.ai.score}/100 — ${stages.ai.band})`);
    for (const s of stages.ai.topSignals) lines.push(`- ${s}`);
  }
  if (stages.readiness?.topFails.length) {
    lines.push("");
    lines.push("## Readiness failures");
    for (const s of stages.readiness.topFails) lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push("_Each engine's full report (complete findings, evidence and exports) is linked from the Full Scan page in Clyvro._");
  return lines.join("\n");
}

export function fullScanToAgentPrompt(targetUrl: string, stages: FullStages): string {
  const lines: string[] = [];
  lines.push(`You are fixing a website after a Clyvro Full Scan of ${targetUrl} — four engines ran in one pass (Rules v5 audit, a real-browser Flow Scan, AI-Pattern detector, Project Readiness). Work only from these observations.`);
  lines.push("");
  lines.push("Rules:");
  lines.push("1. Verify each item in the current codebase before changing anything; if you can't reproduce it, say so instead of guessing.");
  lines.push("2. Work the Top fixes list in order (most severe first). Do not silence errors by removing features.");
  lines.push("3. Show diffs and wait for my approval before committing or publishing.");
  lines.push("");
  lines.push("Scoreboard:");
  lines.push(`- Audit score: ${stages.audit?.status === "done" ? `${stages.audit.score ?? "—"}/100 (${stages.audit.findings} findings)` : "stage failed — see notes"}`);
  lines.push(`- Browser UI flaws: ${stages.flow?.status === "done" ? stages.flow.flaws.length : "stage failed — see notes"}`);
  lines.push(`- AI-pattern score: ${stages.ai?.status === "done" ? `${stages.ai.score}/100 (${stages.ai.band})` : "stage failed"}`);
  lines.push(`- Readiness (${stages.readiness?.tier ?? "—"}): ${stages.readiness?.status === "done" ? `${stages.readiness.fail} failing check(s)` : "stage failed"}`);
  lines.push("");
  lines.push("Top fixes:");
  const fixes = buildTopFixes(stages);
  if (!fixes.length) lines.push("- Nothing urgent surfaced. Confirm nothing regressed in the last deploy.");
  for (const f of fixes) lines.push(`- [${f.severity.toUpperCase()} · ${f.source}] ${f.title} — ${f.detail}`);
  lines.push("");
  lines.push("When done, summarize each fix (file + change) and how to verify it. I will re-run the Full Scan to confirm.");
  return lines.join("\n");
}
