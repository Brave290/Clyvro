"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Fingerprint, LoaderCircle, Lock, MousePointerClick, Sparkles, TriangleAlert } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import ExportBar from "@/components/ExportBar";
import { aiPatternToAgentPrompt, aiPatternToMarkdown } from "@/lib/ai-pattern-shared";
import type { AiPatternReport } from "@/lib/ai-pattern-shared";
import { exportSlug } from "@/lib/check-export";

interface Access { allowed: boolean; planName: string }
interface Row { id: string; domain: string; summary: { score: number; band: string; signals: number }; results: AiPatternReport; createdAt: string }

const BAND_STYLE: Record<string, string> = {
  low: "bg-good-soft text-good",
  moderate: "bg-warn-soft text-warn",
  high: "bg-bad-soft text-bad",
};
const BAND_LABEL: Record<string, string> = {
  low: "Low generic-pattern match",
  moderate: "Moderate generic-pattern match",
  high: "High generic-pattern match",
};

function ReportBlock({ report }: { report: AiPatternReport }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3" role="status">
        <span className={`rounded-xl px-3 py-1.5 text-sm font-bold ${BAND_STYLE[report.band]}`}>
          {report.score}/100 — {BAND_LABEL[report.band]}
        </span>
        <span className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold text-ink-soft">
          {report.signals.length} signal{report.signals.length === 1 ? "" : "s"} · {report.stats.words} words · {report.stats.clicheHits} flagged phrases
        </span>
        <div className="ml-auto">
          <ExportBar
            agentLabel="Copy de-genericize prompt"
            content={{
              markdown: aiPatternToMarkdown(report),
              agentPrompt: aiPatternToAgentPrompt(report),
              json: JSON.stringify({ tool: "clyvro-ai-pattern", exportedAt: new Date().toISOString(), report }, null, 2),
              slug: exportSlug("ai-pattern", report.domain),
            }}
          />
        </div>
      </div>

      <p className="rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-soft">
        <strong className="text-ink">How to read this:</strong> the score measures how strongly the homepage&apos;s public copy and
        structure match patterns common in unedited generic AI/template output. It is <strong className="text-ink">not proof of
        who wrote the site</strong> — it is a specificity audit. The fix is never “sound less like AI”; it is “say things only
        this business can truthfully say.”
      </p>

      {report.signals.length === 0 ? (
        <div className="rounded-2xl border border-good/25 bg-good-soft p-6" role="status">
          <p className="font-semibold text-good">No generic-pattern signals detected on the homepage.</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">The copy reads specific. Use the guard checklist below to keep it that way as the site grows.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {report.signals.map((s) => (
            <div key={s.id} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <TriangleAlert size={15} className="text-warn" aria-hidden />
                {s.label}
                <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn">+{s.weight} pattern weight</span>
              </h3>
              <ul className="mt-3 space-y-1.5">
                {s.evidence.map((e) => (
                  <li key={e} className="break-words rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-soft">{e}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft"><strong className="text-ink">Fix:</strong> {s.advice}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold">Guard checklist — staying un-generic</h3>
        <ul className="mt-3 space-y-2">
          {report.guardChecklist.map((g) => (
            <li key={g} className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden /> {g}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-soft">
          Hand the whole job to your AI agent or developer: <strong className="text-ink">Copy de-genericize prompt</strong> above
          contains every finding, the evidence, and strict no-invented-facts rules.
        </p>
      </div>

      <ul className="space-y-1.5 text-xs leading-relaxed text-ink-mute">
        {report.limitations.map((l) => <li key={l}>• {l}</li>)}
      </ul>
    </div>
  );
}

export default function AiPatternPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<AiPatternReport | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/ai-pattern");
    const json = await res.json().catch(() => null);
    if (res.ok && json) { setAccess(json.access as Access); setHistory(json.history as Row[]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Keep plan access and history live without a manual refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-pattern", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The check couldn't run.");
      setCurrent(json.report as AiPatternReport);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  const locked = access !== null && !access.allowed;

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          AI-Pattern Detector
          <span className="rounded-full bg-good px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Was this site written by a human — or does it just read like every other AI-generated page? This detector scores how
          strongly a site&apos;s public copy and structure match generic AI/template patterns, shows the evidence for every signal,
          and writes the fix as a ready-to-paste prompt for your AI agent. It reports pattern likelihood only — never a false
          claim of proof about authorship. <strong className="text-ink">Pro and Ultra Agency plans.</strong>
        </p>
      </header>

      {locked ? (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock size={17} className="text-accent" aria-hidden />
            A Pro &amp; Ultra Agency feature
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Your workspace is on the <strong className="text-ink">{access.planName}</strong> plan. Pro unlocks the AI-Pattern
            Detector together with private deep scans and expanded audit categories; Ultra Agency adds the full super-strict
            Readiness set and removes every tool counter.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/pricing" className="button-primary"><Sparkles size={15} aria-hidden /> Compare plans</Link>
            <Link href="/app/billing" className="button-secondary">Go to billing</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="ai-domain" className="form-label">Website to analyse <span className="text-bad" aria-hidden="true">*</span></label>
            <input id="ai-domain" required value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" inputMode="url"
              className="form-control mt-1.5" disabled={busy} />
          </div>
          <button type="submit" disabled={busy} className="button-primary">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Fingerprint size={15} aria-hidden />}
            {busy ? "Analysing…" : "Analyse patterns"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="form-error mt-4">{error}</p>}
      {busy && (
        <div className="mt-6 animate-pulse space-y-3" aria-busy="true" aria-label="Analysing patterns">
          <div className="h-10 w-72 rounded-xl bg-line/60" />
          <div className="h-32 rounded-2xl bg-line/50" />
          <div className="h-48 rounded-2xl bg-line/50" />
        </div>
      )}

      {current && !busy && (
        <section aria-label="Latest AI-pattern report" className="mt-8">
          <h2 className="mb-4 text-lg font-bold">{current.domain}</h2>
          <ReportBlock report={current} />
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-line bg-surface p-6" aria-label="Coming soon">
        <h2 className="flex items-center gap-2 font-semibold">
          <MousePointerClick size={17} className="text-accent" aria-hidden />
          Real user-flow scanning
          <span className="rounded-full bg-ink-mute px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Coming soon</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Next for this detector: a Playwright-powered pass that actually clicks through the site — opening menus, stepping
          through checkout-style flows, and checking that the journey a visitor takes still reads specific and works end to end.
          It&apos;s in development, so there&apos;s deliberately nothing to click yet.
        </p>
      </section>

      {history.length > 0 && (
        <section aria-label="Previous AI-pattern checks" className="mt-10">
          <h2 className="text-lg font-bold">Previous checks</h2>
          <ul className="mt-4 space-y-2">
            {history.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => setCurrent(row.results)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                  <span className="flex-1 truncate font-semibold" title={row.domain}>{row.domain}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BAND_STYLE[row.summary.band] ?? ""}`}>{row.summary.score}/100</span>
                  <span className="text-xs text-ink-mute">{row.summary.signals} signals</span>
                  <span className="text-xs text-ink-mute"><LocalDateTime value={row.createdAt} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
