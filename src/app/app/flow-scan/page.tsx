"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, LoaderCircle, Lock, MousePointerClick, NotebookPen, Sparkles } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import ExportBar from "@/components/ExportBar";
import { exportSlug } from "@/lib/check-export";
import {
  flowScanToAgentPrompt,
  flowScanToMarkdown,
  type FlowReport,
  type FlowStep,
} from "@/lib/flow-scan-shared";

interface Access { allowed: boolean; planName: string }
interface ScanRow {
  id: string; targetUrl: string; status: string;
  steps: FlowStep[]; report: FlowReport | null; errorMessage: string | null;
  createdAt: string; finishedAt: string | null;
}
interface HistoryRow { id: string; targetUrl: string; status: string; createdAt: string }

const TERMINAL = ["completed", "failed"];

function StepFeed({ steps, running }: { steps: FlowStep[]; running: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length]);
  return (
    <div className="rounded-2xl border border-line bg-surface p-5" aria-live="polite" aria-label="Live scan progress">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {running ? <LoaderCircle size={15} className="animate-spin text-accent" aria-hidden /> : <MousePointerClick size={15} className="text-accent" aria-hidden />}
        {running ? "Live — the browser is working…" : "Step log"}
      </h3>
      {steps.length === 0 ? (
        <p className="mt-3 text-sm text-ink-mute">Waiting for the first step…</p>
      ) : (
        <ol className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.level === "error" ? "bg-bad" : s.level === "note" ? "bg-warn" : "bg-accent"}`} />
              <span className="min-w-0">
                <span className={s.level === "error" ? "font-semibold text-bad" : s.level === "note" ? "font-medium text-warn" : "text-ink"}>{s.label}</span>
                {s.detail && <span className="block break-words text-xs leading-relaxed text-ink-mute">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />
    </div>
  );
}

function ReportBlock({ report, steps }: { report: FlowReport; steps: FlowStep[] }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3" role="status">
        <span className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold text-ink-soft">
          {report.pages.length} page(s) rendered · {report.consoleErrors.length} console error(s) · {report.failedRequests.length} failed request(s)
        </span>
        <div className="ml-auto">
          <ExportBar
            agentLabel="Copy fix brief for my agent"
            content={{
              markdown: flowScanToMarkdown(report, steps),
              agentPrompt: flowScanToAgentPrompt(report, steps),
              json: JSON.stringify({ tool: "clyvro-flow-scan", exportedAt: new Date().toISOString(), report, steps }, null, 2),
              slug: exportSlug("flow-scan", report.targetUrl),
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold">Pages the browser visited</h3>
        <ul className="mt-3 space-y-2">
          {report.pages.map((p) => (
            <li key={p.url} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line/60 pb-2 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate font-medium" title={p.finalUrl}>{p.finalUrl}</span>
              <span className="text-xs text-ink-mute">HTTP {p.status ?? "—"}</span>
              <span className="text-xs text-ink-mute">“{p.title ?? "no title"}”</span>
              <span className="text-xs text-ink-mute">{p.renderedWords} rendered words</span>
            </li>
          ))}
        </ul>
        {report.tech.length > 0 && (
          <p className="mt-3 text-xs text-ink-mute">Visible after rendering: {report.tech.join(" · ")}</p>
        )}
      </div>

      {(report.consoleErrors.length > 0 || report.failedRequests.length > 0) && (
        <div className="rounded-2xl border border-bad/25 bg-bad-soft/40 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-bad"><CircleAlert size={15} aria-hidden /> What went wrong during the visit</h3>
          <ul className="mt-3 space-y-1.5">
            {report.consoleErrors.map((e, i) => (
              <li key={`c${i}`} className="break-words rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft"><strong>Console:</strong> {e.text} <span className="text-ink-mute">({e.page})</span></li>
            ))}
            {report.failedRequests.map((f, i) => (
              <li key={`f${i}`} className="break-words rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft"><strong>Failed request:</strong> {f.url} — {f.failure}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><NotebookPen size={15} className="text-accent" aria-hidden /> Notes from the run</h3>
        <ul className="mt-3 space-y-1.5">
          {report.notes.map((n) => <li key={n} className="text-sm leading-relaxed text-ink-soft">• {n}</li>)}
        </ul>
      </div>

      <ul className="space-y-1.5 text-xs leading-relaxed text-ink-mute">
        {report.limitations.map((l) => <li key={l}>• {l}</li>)}
      </ul>
    </div>
  );
}

export default function FlowScanPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ScanRow | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/flow-scans");
    const json = await res.json().catch(() => null);
    if (res.ok && json) { setAccess(json.access as Access); setHistory(json.history as HistoryRow[]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const poll = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/flow-scans/${id}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.scan) {
        const scan = json.scan as ScanRow;
        setCurrent(scan);
        if (TERMINAL.includes(scan.status)) {
          stopPolling();
          setBusy(false);
          void load();
        }
      }
    }, 1500);
  }, [load]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCurrent(null);
    try {
      const res = await fetch("/api/flow-scans", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't start the flow scan.");
      const id = (json as { id: string }).id;
      setCurrent({ id, targetUrl: url, status: "queued", steps: [], report: null, errorMessage: null, createdAt: new Date().toISOString(), finishedAt: null });
      poll(id);
      // Execute (long-running). The poll above renders live steps meanwhile;
      // an abort/timeout here still resolves via polling the saved row.
      void fetch(`/api/flow-scans/${id}/run`, { method: "POST" }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the flow scan.");
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    stopPolling();
    setBusy(false);
    const res = await fetch(`/api/flow-scans/${id}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json?.scan) setCurrent(json.scan as ScanRow);
  }

  const locked = access !== null && !access.allowed;
  const running = current !== null && !TERMINAL.includes(current.status);

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Flow Scan
          <span className="rounded-full bg-good px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          A real headless browser visits your site with JavaScript on — rendering pages the way visitors get them, probing
          menus, following links, and <strong className="text-ink">streaming every step live</strong> while it works. Anything
          that goes wrong (console errors, failed requests, unreachable pages) is written into the run&apos;s notes.
          It never submits forms and never touches checkout, delete or sign-out actions.{" "}
          <strong className="text-ink">Pro and Ultra Agency plans.</strong>
        </p>
      </header>

      {locked ? (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock size={17} className="text-accent" aria-hidden /> A Pro &amp; Ultra Agency feature
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Your workspace is on the <strong className="text-ink">{access.planName}</strong> plan. Pro unlocks Flow Scan
            together with the AI-Pattern detector and private deep scans; Ultra Agency adds the full super-strict
            Readiness set and removes every counter.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/pricing" className="button-primary"><Sparkles size={15} aria-hidden /> Compare plans</Link>
            <Link href="/app/billing" className="button-secondary">Go to billing</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="fs-url" className="form-label">Website to walk through <span className="text-bad" aria-hidden="true">*</span></label>
            <input id="fs-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" inputMode="url"
              className="form-control mt-1.5" disabled={busy} />
          </div>
          <button type="submit" disabled={busy} className="button-primary">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <MousePointerClick size={15} aria-hidden />}
            {busy ? "Scanning…" : "Start flow scan"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="form-error mt-4">{error}</p>}

      {current && (
        <section aria-label="Flow scan result" className="mt-8 space-y-6">
          <h2 className="text-lg font-bold">
            {current.targetUrl}
            <span className={`ml-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              current.status === "completed" ? "bg-good-soft text-good" : current.status === "failed" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"
            }`}>{current.status}</span>
          </h2>
          <StepFeed steps={current.steps ?? []} running={running} />
          {current.status === "failed" && current.errorMessage && (
            <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{current.errorMessage}</p>
          )}
          {current.status === "completed" && current.report && (
            <ReportBlock report={current.report} steps={current.steps ?? []} />
          )}
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="Previous flow scans" className="mt-10">
          <h2 className="text-lg font-bold">Previous flow scans</h2>
          <ul className="mt-4 space-y-2">
            {history.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => void openHistory(row.id)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                  <span className="flex-1 truncate font-semibold" title={row.targetUrl}>{row.targetUrl}</span>
                  <span className="text-xs font-semibold capitalize text-ink-soft">{row.status}</span>
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
