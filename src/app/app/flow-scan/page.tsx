"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, LoaderCircle, Lock, MousePointerClick, NotebookPen, Sparkles } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import FlowBrowser from "@/components/FlowBrowser";
import { FlowScreenshotPreview } from "@/components/FlowScreenshotPreview";
import ExportBar from "@/components/ExportBar";
import { exportSlug } from "@/lib/check-export";
import {
  flowScanToAgentPrompt,
  flowScanToMarkdown,
  type FlowReport,
  type FlowStep,
} from "@/lib/flow-scan-shared";

interface Access {
  allowed: boolean; planName: string;
  limit: number | null; remaining: number | null;
  period: "lifetime" | "monthly" | "unlimited";
}
interface ScanRow {
  id: string; targetUrl: string; status: string;
  steps: FlowStep[]; report: FlowReport | null; errorMessage: string | null;
  createdAt: string; finishedAt: string | null;
}
interface HistoryRow { id: string; targetUrl: string; status: string; createdAt: string }

const TERMINAL = ["completed", "failed"];

function ReportBlock({ report, steps }: { report: FlowReport; steps: FlowStep[] }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3" role="status">
        <span className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold text-ink-soft">
          {report.pages.length} page(s) rendered · {report.consoleErrors.length} console error(s) · {report.failedRequests.length} failed request(s)
          {(report.cancelledRequests?.count ?? 0) > 0 && <> · {report.cancelledRequests!.count} cancelled prefetch(es) — not failures</>}
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
        <h3 className="text-base font-bold">Visited pages</h3>
        <ul className="mt-3 space-y-2">
          {report.pages.map((p) => (
            <li key={p.url} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/60 pb-2 text-base last:border-0">
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{p.finalUrl}</span>
              <span className="text-sm text-ink-mute">HTTP {p.status ?? "—"}</span>
              <span className="text-sm text-ink-mute">“{p.title ?? "no title"}”</span>
              <span className="text-sm text-ink-mute">{p.renderedWords} rendered words</span>
              {p.durationMs != null && <span className="text-sm text-ink-mute">rendered in {(p.durationMs / 1000).toFixed(1)}s</span>}
              {p.vitals && (
                <span className="text-sm text-ink-mute" title="Lab values from this single headless load — not real-user field data">
                  lab: TTFB {p.vitals.ttfbMs ?? "—"}ms · LCP {p.vitals.lcpMs ?? "—"}ms · CLS {p.vitals.cls ?? "—"}
                </span>
              )}
              {(p.screenshot || p.screenshotMobile) && (
                <FlowScreenshotPreview finalUrl={p.finalUrl} screenshot={p.screenshot} screenshotMobile={p.screenshotMobile} />
              )}
            </li>
          ))}
        </ul>
        {report.tech.length > 0 && (
          <p className="mt-3 text-sm text-ink-mute">Visible after rendering: {report.tech.join(" · ")}</p>
        )}
      </div>

      {(report.uiDiscrepancies?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-base font-bold">UI discrepancies <span className="font-medium text-ink-mute">(measured in the rendered page — where things are, not opinions)</span></h3>
          <ul className="mt-3 space-y-3">
            {report.uiDiscrepancies!.map((d) => (
              <li key={d.id + d.evidence} className="rounded-xl bg-canvas px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${d.level === "flaw" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
                    {d.level === "flaw" ? "Flaw" : "Note"}
                  </span>
                  {d.title}
                </p>
                <p className="mt-1.5 break-words text-base leading-relaxed text-ink">{d.evidence}</p>
                <p className="mt-1.5 text-base leading-relaxed text-ink-soft"><strong className="text-ink">Fix:</strong> {d.recommendation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {((report.findings?.length ?? 0) > 0 || report.aiPattern) && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-base font-bold">Scanner + AI-pattern, on the rendered page</h3>
          {report.aiPattern && (
            <p className="mt-2 text-sm text-ink-soft">
              AI-pattern read (rendered): <strong className="text-ink">{report.aiPattern.score}/100 — {report.aiPattern.band}</strong>
              {report.aiPattern.topSignals.length > 0 && <> · top signals: {report.aiPattern.topSignals.join("; ")}</>}
            </p>
          )}
          {(report.findings?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1.5">
              {report.findings!.map((f) => (
                <li key={f.ruleId + f.title} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${f.severity === "high" || f.severity === "critical" ? "bg-bad-soft text-bad" : f.severity === "medium" ? "bg-warn-soft text-warn" : "bg-canvas text-ink-soft"}`}>{f.severity}</span>
                  <span className="font-medium">{f.title}</span>
                  <span className="font-mono text-sm text-ink-mute">{f.ruleId} · {f.page}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-base text-ink-soft">The latest scanner ruleset and the AI-pattern detector ran on the DOM after JavaScript — so client-rendered issues the raw-HTML scanner can&apos;t see are included.</p>
        </div>
      )}

      {(report.consoleErrors.length > 0 || report.failedRequests.length > 0) && (
        <div className="rounded-2xl border border-bad/25 bg-bad-soft/40 p-5">
          <h3 className="flex items-center gap-2 text-base font-bold text-bad"><CircleAlert size={15} aria-hidden /> Run errors</h3>
          <ul className="mt-3 space-y-1.5">
            {report.consoleErrors.map((e, i) => (
              <li key={`c${i}`} className="break-words rounded-lg bg-surface px-3 py-2 text-base leading-relaxed text-ink"><strong>Console:</strong> {e.text} <span className="text-ink-mute">({e.page})</span></li>
            ))}
            {report.failedRequests.map((f, i) => (
              <li key={`f${i}`} className="break-words rounded-lg bg-surface px-3 py-2 text-base leading-relaxed text-ink"><strong>Failed request:</strong> {f.url} — {f.failure}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="flex items-center gap-2 text-base font-bold"><NotebookPen size={15} className="text-accent" aria-hidden /> Run notes</h3>
        <ul className="mt-3 space-y-1.5">
          {report.notes.map((n) => <li key={n} className="text-sm leading-relaxed text-ink-soft">• {n}</li>)}
        </ul>
      </div>

      <ul className="space-y-1.5 text-base leading-relaxed text-ink-soft">
        {report.limitations.map((l) => <li key={l}>• {l}</li>)}
      </ul>
    </div>
  );
}

export default function FlowScanPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageCount, setHistoryPageCount] = useState(1);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ScanRow | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/flow-scans?page=${historyPage}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json) { setAccess(json.access as Access); setHistory(json.history as HistoryRow[]); setHistoryPageCount(json.pagination?.pageCount ?? 1); }
  }, [historyPage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  function changeHistoryPage(next: number) {
    setHistoryPage(Math.max(1, Math.min(historyPageCount, next)));
  }

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
          A real Chromium window opens your site. You watch the live page picture as it walks — not a mock. It checks UI issues, ruleset 7, and AI-pattern signals. It never submits forms or touches checkout, delete, or sign-out.
        </p>
        {access && (
          <p className="mt-2 text-sm text-ink-soft" role="status">
            <strong className="text-ink">{access.planName} plan:</strong>{" "}
            {access.remaining === null
              ? "unlimited Flow Scan runs."
              : `${access.remaining} of ${access.limit} run${access.limit === 1 ? "" : "s"} left ${access.period === "lifetime" ? "(lifetime allowance)" : "this month"}.`}
          </p>
        )}
      </header>

      {locked ? (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock size={17} className="text-accent" aria-hidden /> Flow Scan allowance used up
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            You&apos;ve used the Flow Scan allowance on <strong className="text-ink">{access.planName}</strong>{access.period === "monthly" ? " this month — it resets on the 1st" : ""}. Upgrade to raise the cap.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/pricing" className="button-primary"><Sparkles size={15} aria-hidden /> Compare plans</Link>
            <Link href="/app/billing" className="button-secondary">Go to billing</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="fs-url" className="form-label">Website URL <span className="text-bad" aria-hidden="true">*</span></label>
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
          <FlowBrowser steps={current.steps ?? []} running={running} targetUrl={current.targetUrl} status={current.status} />
          {current.status === "failed" && current.errorMessage && (
            <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{current.errorMessage}</p>
          )}
          {current.status === "completed" && current.report && (
            <ReportBlock report={current.report} steps={current.steps ?? []} />
          )}
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="History" className="mt-10">
          <h2 className="text-lg font-bold">History</h2>
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
          {historyPageCount > 1 && <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <button type="button" disabled={historyPage <= 1} onClick={() => changeHistoryPage(historyPage - 1)} className="button-secondary !min-h-9 !px-3">Previous</button>
            <span className="text-ink-soft">Page {historyPage} of {historyPageCount}</span>
            <button type="button" disabled={historyPage >= historyPageCount} onClick={() => changeHistoryPage(historyPage + 1)} className="button-secondary !min-h-9 !px-3">Next</button>
          </div>}
        </section>
      )}
    </div>
  );
}
