"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, CircleAlert, CircleDashed, LoaderCircle, Lock, ScanSearch, Sparkles, XCircle,
} from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import ExportBar from "@/components/ExportBar";
import { exportSlug } from "@/lib/check-export";
import type { FlowStep } from "@/lib/flow-scan-shared";
import {
  STAGE_PLAN,
  buildTopFixes,
  fullScanToAgentPrompt,
  fullScanToMarkdown,
  type FullStages,
} from "@/lib/full-scan-shared";

interface Access {
  allowed: boolean; planName: string;
  limit: number | null; remaining: number | null;
  period: "lifetime" | "monthly" | "unlimited";
}
interface ScanRow {
  id: string; targetUrl: string; status: string;
  steps: FlowStep[]; stages: FullStages | null; errorMessage: string | null;
  createdAt: string; finishedAt: string | null;
}
interface HistoryRow { id: string; targetUrl: string; status: string; createdAt: string }

const TERMINAL = ["completed", "failed"];
const SEV_STYLE: Record<string, string> = {
  critical: "bg-bad-soft text-bad",
  high: "bg-bad-soft text-bad",
  medium: "bg-warn-soft text-warn",
  low: "bg-canvas text-ink-soft",
};

function Scoreboard({ stages }: { stages: FullStages }) {
  const fixes = buildTopFixes(stages);
  const card = (label: string, big: string, sub: string, failed?: string) => (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
      {failed ? (
        <p className="mt-2 text-sm font-medium text-bad">Didn&apos;t run — {failed}</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold tracking-tight">{big}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-mute">{sub}</p>
        </>
      )}
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {card(
          "Audit — Rules v5",
          `${stages.audit?.score ?? "—"} / 100`,
          `${stages.audit?.findings ?? 0} finding(s) across ${stages.audit?.pages ?? 0} page(s)`,
          stages.audit?.status === "failed" ? stages.audit.error : undefined,
        )}
        {card(
          "Flow Scan — real browser",
          `${stages.flow?.flaws.length ?? 0} UI flaw${stages.flow?.flaws.length === 1 ? "" : "s"}`,
          `${stages.flow?.pages ?? 0} page(s) rendered · ${stages.flow?.notes ?? 0} note(s)${stages.flow?.scanId ? " · full detail in Flow Scan" : ""}`,
          stages.flow?.status === "failed" ? stages.flow.error : undefined,
        )}
        {card(
          "AI-Pattern",
          `${stages.ai?.score ?? "—"} / 100`,
          `Band: ${stages.ai?.band ?? "—"} — how generic the copy reads`,
          stages.ai?.status === "failed" ? stages.ai.error : undefined,
        )}
        {card(
          "Readiness",
          `${stages.readiness?.fail ?? 0} failing`,
          `${stages.readiness?.tier ?? "—"} tier · ${stages.readiness?.pass ?? 0} pass / ${stages.readiness?.warn ?? 0} warn`,
          stages.readiness?.status === "failed" ? stages.readiness.error : undefined,
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-base font-bold">Top fixes — every engine, most severe first</h3>
        {fixes.length === 0 ? (
          <p className="mt-2 text-base text-ink-soft">Nothing urgent surfaced in this run. Well done — keep it that way.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {fixes.map((f) => (
              <li key={f.title} className="rounded-xl bg-canvas px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${SEV_STYLE[f.severity]}`}>{f.severity}</span>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-accent">{f.source}</span>
                  {f.title}
                </p>
                <p className="mt-1.5 text-base leading-relaxed text-ink-soft">{f.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function FullScanPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageCount, setHistoryPageCount] = useState(1);
  const [current, setCurrent] = useState<ScanRow | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const poll = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/full-scans/${id}`);
        const json = await res.json().catch(() => null);
        if (res.ok && json?.scan) {
          setCurrent(json.scan as ScanRow);
          if (TERMINAL.includes((json.scan as ScanRow).status)) {
            stopPolling();
            setBusy(false);
            const list = await fetch(`/api/full-scans?page=${historyPage}`).then((r) => r.json()).catch(() => null);
            if (list) { setAccess(list.access as Access); setHistory(list.history as HistoryRow[]); setHistoryPageCount(list.pagination?.pageCount ?? 1); }
          }
        }
      } catch { /* keep polling */ }
    }, 1500);
  }, [historyPage, stopPolling]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/full-scans?page=${historyPage}`).then((r) => r.json()).catch(() => null);
      if (!cancelled && res) {
        setAccess(res.access as Access);
        setHistory(res.history as HistoryRow[]);
        setHistoryPageCount(res.pagination?.pageCount ?? 1);
        const first = (res.history as HistoryRow[])[0];
        if (first) {
          const one = await fetch(`/api/full-scans/${first.id}`).then((r) => r.json()).catch(() => null);
          if (!cancelled && one?.scan) {
            setCurrent(one.scan as ScanRow);
            const s = one.scan as ScanRow;
            if (!TERMINAL.includes(s.status)) { setBusy(true); poll(s.id); }
          }
        }
      }
    })();
    return () => { cancelled = true; stopPolling(); };
  }, [poll, stopPolling, historyPage]);

  async function changeHistoryPage(next: number) {
    const safe = Math.max(1, Math.min(historyPageCount, next));
    const list = await fetch(`/api/full-scans?page=${safe}`).then((r) => r.json()).catch(() => null);
    if (list) { setHistoryPage(safe); setHistory(list.history as HistoryRow[]); setHistoryPageCount(list.pagination?.pageCount ?? 1); }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !url.trim()) return;
    setError(null);
    setBusy(true);
    setCurrent(null);
    try {
      const res = await fetch("/api/full-scans", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't start the full scan.");
      const id = (json as { id: string }).id;
      setCurrent({ id, targetUrl: url, status: "queued", steps: [], stages: null, errorMessage: null, createdAt: new Date().toISOString(), finishedAt: null });
      poll(id);
      void fetch(`/api/full-scans/${id}/run`, { method: "POST" }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the full scan.");
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    stopPolling();
    setBusy(false);
    const res = await fetch(`/api/full-scans/${id}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json?.scan) setCurrent(json.scan as ScanRow);
  }

  const locked = access !== null && !access.allowed;
  const running = current !== null && !TERMINAL.includes(current.status);

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Full Scan
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Pro</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Run Rules, Flow, AI-Pattern, and Readiness together in one prioritized report. Stages are isolated, and only the Full Scan allowance is used.
        </p>
        {access && (
          <p className="mt-2 text-sm text-ink-soft" role="status">
            <strong className="text-ink">{access.planName} plan:</strong>{" "}
            {access.remaining === null
              ? "unlimited Full Scans."
              : `${access.remaining} of ${access.limit} Full Scan${access.limit === 1 ? "" : "s"} left this month.`}
          </p>
        )}
      </header>

      {locked ? (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock size={17} className="text-accent" aria-hidden />
            {(access?.limit ?? 0) === 0
              ? "Full Scan is a Pro & Ultra Agency bundle"
              : "Full Scan allowance used up this month"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {(access?.limit ?? 0) === 0 ? (
              <>
                Full Scan is for <strong className="text-ink">Pro</strong> (10/month) and <strong className="text-ink">Ultra Agency</strong> (unlimited). Individual tools remain available on your {access?.planName} plan.
              </>
            ) : (
              <>
                You&apos;ve used this month&apos;s Full Scans on the <strong className="text-ink">{access?.planName}</strong>{" "}
                plan — it resets on the 1st, or upgrade to Ultra Agency for unlimited.
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/pricing" className="button-primary"><Sparkles size={15} aria-hidden /> Compare plans</Link>
            <Link href="/app/billing" className="button-secondary">Go to billing</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="fu-url" className="form-label">Website URL <span className="text-bad" aria-hidden="true">*</span></label>
            <input id="fu-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" inputMode="url"
              className="form-control mt-1.5" disabled={busy} />
          </div>
          <button type="submit" disabled={busy} className="button-primary">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <ScanSearch size={15} aria-hidden />}
            {busy ? "Scanning…" : "Run Full Scan"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="form-error mt-4">{error}</p>}

      {current && (
        <section aria-label="Full scan result" className="mt-8 space-y-6">
          <h2 className="text-lg font-bold">
            {current.targetUrl}
            <span className={`ml-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              current.status === "completed" ? "bg-good-soft text-good" : current.status === "failed" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"
            }`}>{current.status}</span>
          </h2>

          {/* Live stage checklist */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold">{running ? "Engines running…" : "Engines in this run"}</h3>
            <ol className="mt-3 space-y-2.5">
              {STAGE_PLAN.map((s) => {
                const stage = current.stages?.[s.id];
                const st = stage ? stage.status : running ? "pending" : "pending";
                return (
                  <li key={s.id} className="flex items-start gap-2.5 text-sm">
                    {st === "done" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
                      : st === "failed" ? <XCircle size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                      : running ? <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin text-accent" aria-hidden />
                      : <CircleDashed size={16} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />}
                    <span className={st === "failed" ? "text-ink-soft" : ""}>
                      {s.label}
                      {st === "failed" && stage?.error && <span className="block text-xs text-bad">Didn&apos;t run — {stage.error}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            {(current.steps?.length ?? 0) > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold text-ink-soft">Run log ({current.steps.length} step{current.steps.length === 1 ? "" : "s"})</summary>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-soft">
                  {current.steps.map((st, i) => (
                    <li key={i} className={st.level === "error" ? "text-bad" : ""}>
                      <span className="text-ink-mute">{new Date(st.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> {st.label}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {running && <p className="mt-3 flex items-center gap-2 text-xs text-ink-mute" role="status"><CircleAlert size={13} aria-hidden /> Four engines run one after another — the browser stage takes the longest. Keep this tab open.</p>}
          </div>

          {current.status === "failed" && current.errorMessage && (
            <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{current.errorMessage}</p>
          )}
          {current.stages && (
            <>
              <Scoreboard stages={current.stages} />
              <div className="flex justify-end">
                <ExportBar
                  agentLabel="Copy fix brief for my agent"
                  content={{
                    markdown: fullScanToMarkdown(current.targetUrl, current.stages),
                    agentPrompt: fullScanToAgentPrompt(current.targetUrl, current.stages),
                    json: JSON.stringify({ tool: "clyvro-full-scan", exportedAt: new Date().toISOString(), targetUrl: current.targetUrl, stages: current.stages, steps: current.steps }, null, 2),
                    slug: exportSlug("full-scan", current.targetUrl),
                  }}
                />
              </div>
              {current.stages.flow?.scanId && (
                <p className="text-xs text-ink-mute">
                  Browser detail lives in{" "}
                  <Link href="/app/flow-scan" className="font-semibold text-accent underline-offset-2 hover:underline">Flow Scan</Link>;
                  readiness detail in{" "}
                  <Link href="/app/readiness" className="font-semibold text-accent underline-offset-2 hover:underline">Readiness</Link>.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="Previous full scans" className="mt-10">
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
            <button type="button" disabled={historyPage <= 1} onClick={() => void changeHistoryPage(historyPage - 1)} className="button-secondary !min-h-9 !px-3">Previous</button>
            <span className="text-ink-soft">Page {historyPage} of {historyPageCount}</span>
            <button type="button" disabled={historyPage >= historyPageCount} onClick={() => void changeHistoryPage(historyPage + 1)} className="button-secondary !min-h-9 !px-3">Next</button>
          </div>}
        </section>
      )}
    </div>
  );
}
