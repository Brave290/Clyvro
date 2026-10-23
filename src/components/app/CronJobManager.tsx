"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlarmClock, ArrowRight, Check, ChevronDown, Clock3, Copy, FileJson2, Globe, History, LoaderCircle,
  Pause, Play, Plus, Trash2, Zap,
} from "lucide-react";
import { BrandSelect } from "@/components/ui";
import LocalDateTime from "@/components/LocalDateTime";
import { ConfirmDialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";

interface CronRun {
  id: string; status: number | null; ok: boolean; durationMs: number | null; error: string | null; createdAt: string;
  trigger?: string | null;
  responseHeaders?: Record<string, string> | null;
  responseBody?: string | null;
  responseContentType?: string | null;
  responseBytes?: number | null;
  responseTruncated?: boolean | null;
  finalUrl?: string | null;
}
interface CronJob {
  id: string; name: string; url: string; method: string; intervalMinutes: number; enabled: boolean;
  nextRunAt: string; lastRunAt: string | null; lastStatus: number | null; lastError: string | null;
  lastDurationMs?: number | null; consecutiveFailures?: number | null;
}
interface Item { job: CronJob; runs: CronRun[] }
interface Payload { jobs: Item[]; planName: string; maxCronJobs: number; canWrite: boolean }
interface RunResult {
  ok: boolean; status: number | null; statusLine: string; durationMs: number; error: string | null; trigger: string; finalUrl: string | null;
  response: { headers: Record<string, string>; body: string | null; contentType: string | null; bytes: number | null; truncated: boolean };
}

const INTERVALS = [
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "180", label: "Every 3 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
  { value: "10080", label: "Weekly" },
  { value: "custom", label: "Custom (minutes)" },
];

const REASONS: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  405: "Method Not Allowed", 408: "Request Timeout", 409: "Conflict", 410: "Gone", 422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

function statusLine(status: number | null, error?: string | null): string {
  if (status === null) return error ?? "No HTTP response";
  return REASONS[status] ? `HTTP ${status} ${REASONS[status]}` : `HTTP ${status}`;
}

function intervalLabel(min: number): string {
  if (min % 1440 === 0) return min === 1440 ? "Daily" : `Every ${min / 1440} days`;
  if (min % 60 === 0) return min === 60 ? "Hourly" : `Every ${min / 60} hours`;
  return `Every ${min} minutes`;
}

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function prettyBody(body: string | null | undefined, contentType: string | null | undefined): { text: string; json: boolean } {
  if (!body) return { text: "", json: false };
  const looksJson = (contentType ?? "").includes("json") || /^[\s]*[[{]/.test(body);
  if (looksJson) {
    try { return { text: JSON.stringify(JSON.parse(body), null, 2), json: true }; } catch { /* not valid JSON — show raw */ }
  }
  return { text: body, json: false };
}

function statusTone(status: number | null, ok: boolean): string {
  if (status === null) return "bg-bad-soft text-bad border-bad/25";
  if (ok && status < 300) return "bg-good-soft text-good border-good/25";
  if (ok) return "bg-accent-soft text-accent border-accent/25";
  if (status === 429 || status >= 500) return "bg-bad-soft text-bad border-bad/25";
  return "bg-warn-soft text-warn border-warn/25";
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11px] font-semibold text-ink-soft transition hover:border-accent/50 hover:text-ink">
      {done ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {done ? "Copied" : "Copy"}
    </button>
  );
}

/** The full server response of one run: status line, timing, every header, and the body. */
function ResponseView({ run }: { run: RunResult | CronRun }) {
  const isResult = "response" in run;
  const status = run.status;
  const ok = run.ok;
  const error = run.error ?? null;
  const headers = isResult ? run.response.headers : run.responseHeaders ?? {};
  const body = isResult ? run.response.body : run.responseBody ?? null;
  const contentType = isResult ? run.response.contentType : run.responseContentType ?? null;
  const bytes = isResult ? run.response.bytes : run.responseBytes ?? null;
  const truncated = isResult ? run.response.truncated : Boolean(run.responseTruncated);
  const finalUrl = run.finalUrl ?? null;
  const duration = run.durationMs;
  const [tab, setTab] = useState<"body" | "headers">("body");
  const pretty = useMemo(() => prettyBody(body, contentType), [body, contentType]);
  const headerEntries = Object.entries(headers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rawHeaders = headerEntries.map(([k, v]) => `${k}: ${v}`).join("\n");

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold ${statusTone(status, ok)}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-current" : "bg-current"}`} aria-hidden />
          {statusLine(status, error)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-ink-soft"><Clock3 size={12} aria-hidden /> {formatDuration(duration)}</span>
        <span className="text-xs text-ink-soft">{formatBytes(bytes)}{truncated ? " (first 8 KB kept)" : ""}</span>
        {contentType && <span className="hidden truncate font-mono text-[11px] text-ink-mute sm:inline" title={contentType}>{contentType}</span>}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-canvas p-0.5">
          <button type="button" onClick={() => setTab("body")} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${tab === "body" ? "bg-surface text-ink shadow-sm" : "text-ink-mute"}`}>Body</button>
          <button type="button" onClick={() => setTab("headers")} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${tab === "headers" ? "bg-surface text-ink shadow-sm" : "text-ink-mute"}`}>Headers <span className="text-ink-mute">({headerEntries.length})</span></button>
        </div>
      </div>
      {error && status === null && (
        <p className="border-b border-line bg-bad-soft/60 px-3 py-2 text-xs leading-relaxed text-bad">{error}</p>
      )}
      {finalUrl && (
        <p className="truncate border-b border-line px-3 py-1.5 font-mono text-[11px] text-ink-mute" title={finalUrl}>→ {finalUrl}</p>
      )}
      {tab === "body" ? (
        <div className="relative">
          <div className="absolute right-2 top-2 flex gap-1">
            {pretty.json && <span className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11px] font-semibold text-ink-soft"><FileJson2 size={12} aria-hidden /> JSON</span>}
            {pretty.text && <CopyButton text={body ?? ""} label="Copy response body" />}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all p-3 pr-28 font-mono text-[11.5px] leading-relaxed text-ink">
            {pretty.text || <span className="text-ink-mute">{status === null ? "The request never produced a response body." : "Empty body."}</span>}
          </pre>
        </div>
      ) : (
        <div className="relative">
          {rawHeaders && <div className="absolute right-2 top-2"><CopyButton text={rawHeaders} label="Copy response headers" /></div>}
          {headerEntries.length === 0 ? (
            <p className="p-3 text-xs text-ink-mute">No headers were captured for this run.</p>
          ) : (
            <dl className="max-h-80 divide-y divide-line/70 overflow-auto font-mono text-[11.5px]">
              {headerEntries.map(([k, v]) => (
                <div key={k} className="grid gap-x-3 px-3 py-1.5 sm:grid-cols-[14rem_minmax(0,1fr)]">
                  <dt className="truncate font-semibold text-accent" title={k}>{k}</dt>
                  <dd className="break-all text-ink-soft">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: CronRun }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono font-bold ${statusTone(run.status, run.ok)}`}>{run.status ?? "ERR"}</span>
        <span className="font-medium text-ink">{statusLine(run.status, run.error)}</span>
        <span className="text-ink-mute">·</span>
        <span className="text-ink-soft">{formatDuration(run.durationMs)}</span>
        {run.trigger === "manual" && <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-mute">manual</span>}
        <span className="ml-auto text-ink-mute"><LocalDateTime value={run.createdAt} /></span>
        <ChevronDown size={14} className={`text-ink-mute transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="border-t border-line p-2"><ResponseView run={run} /></div>}
    </li>
  );
}

function JobCard({ item, canWrite, onChanged }: { item: Item; canWrite: boolean; onChanged: () => Promise<void> }) {
  const { job } = item;
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<CronRun[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"toggle" | "delete" | null>(null);

  const recent = history ?? item.runs;
  const successRate = recent.length ? Math.round((recent.filter((r) => r.ok).length / recent.length) * 100) : null;

  async function runNow() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/cron-jobs/${job.id}/run`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as RunResult | { error?: { message?: string } } | null;
      if (!res.ok || !json || !("response" in json)) {
        toast("error", "Couldn't run the job", (json as { error?: { message?: string } } | null)?.error?.message ?? "Please try again.");
        return;
      }
      setResult(json);
      if (json.ok) toast("success", "Job ran", `${json.statusLine} in ${formatDuration(json.durationMs)}.`);
      else toast("error", "Job ran with a problem", json.statusLine);
      setHistory(null);
      await onChanged();
    } finally {
      setRunning(false);
    }
  }

  async function loadHistory() {
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (history) return;
    const res = await fetch(`/api/cron-jobs/${job.id}/runs`);
    const json = await res.json().catch(() => null);
    if (res.ok && Array.isArray(json?.runs)) setHistory(json.runs as CronRun[]);
  }

  async function toggle() {
    setBusy("toggle");
    try {
      await fetch(`/api/cron-jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !job.enabled }) });
      await onChanged();
    } finally { setBusy(null); }
  }

  async function remove() {
    setBusy("delete");
    try {
      await fetch(`/api/cron-jobs/${job.id}`, { method: "DELETE" });
      toast("success", "Cron job deleted");
      await onChanged();
    } finally { setBusy(null); }
  }

  const lastTone = job.lastStatus === null && !job.lastRunAt ? "bg-canvas text-ink-mute border-line"
    : statusTone(job.lastStatus, job.lastStatus !== null && job.lastStatus >= 200 && job.lastStatus < 400);

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${!job.enabled ? "bg-line" : (job.consecutiveFailures ?? 0) > 0 ? "bg-bad" : job.lastRunAt ? "bg-good animate-pulse-dot" : "bg-accent"}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold" title={job.name}>{job.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${job.enabled ? "bg-good-soft text-good" : "bg-canvas text-ink-mute"}`}>{job.enabled ? "Active" : "Paused"}</span>
              {(job.consecutiveFailures ?? 0) > 1 && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bad">{job.consecutiveFailures} failures in a row</span>}
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-xs text-ink-soft">
              <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-bold text-ink">{job.method}</span>
              <span className="truncate" title={job.url}>{job.url}</span>
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => void runNow()} disabled={running} className="button-primary !min-h-9 !px-3 !py-1.5 text-xs">
                {running ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />} {running ? "Running…" : "Run now"}
              </button>
              <button type="button" onClick={() => void toggle()} disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs">
                {job.enabled ? <><Pause size={13} aria-hidden /> Pause</> : <><Play size={13} aria-hidden /> Resume</>}
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null} aria-label={`Delete ${job.name}`} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs text-bad hover:!bg-bad-soft">
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-line/70 bg-canvas p-3">
            <dt className="flex items-center gap-1 text-ink-mute"><AlarmClock size={12} aria-hidden /> Schedule</dt>
            <dd className="mt-1 font-semibold text-ink">{intervalLabel(job.intervalMinutes)}</dd>
          </div>
          <div className="rounded-xl border border-line/70 bg-canvas p-3">
            <dt className="flex items-center gap-1 text-ink-mute"><Activity size={12} aria-hidden /> Last response</dt>
            <dd className="mt-1"><span className={`inline-flex rounded-full border px-2 py-0.5 font-mono font-bold ${lastTone}`}>{job.lastRunAt ? statusLine(job.lastStatus, job.lastError) : "Not run yet"}</span></dd>
          </div>
          <div className="rounded-xl border border-line/70 bg-canvas p-3">
            <dt className="flex items-center gap-1 text-ink-mute"><Zap size={12} aria-hidden /> Last run</dt>
            <dd className="mt-1 font-semibold text-ink">{job.lastRunAt ? <><LocalDateTime value={job.lastRunAt} />{job.lastDurationMs != null && <span className="font-normal text-ink-mute"> · {formatDuration(job.lastDurationMs)}</span>}</> : "—"}</dd>
          </div>
          <div className="rounded-xl border border-line/70 bg-canvas p-3">
            <dt className="flex items-center gap-1 text-ink-mute"><ArrowRight size={12} aria-hidden /> Next run</dt>
            <dd className="mt-1 font-semibold text-ink">{job.enabled ? <LocalDateTime value={job.nextRunAt} /> : "Paused"}</dd>
          </div>
        </dl>

        {recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ul className="flex items-center gap-1" aria-label="Recent runs, newest first">
              {recent.slice(0, 20).map((r) => (
                <li key={r.id} title={`${statusLine(r.status, r.error)} · ${formatDuration(r.durationMs)}`}
                  className={`h-5 w-1.5 rounded-sm ${r.ok ? "bg-good" : r.status === null ? "bg-bad" : "bg-warn"}`} />
              ))}
            </ul>
            {successRate !== null && <span className="text-xs text-ink-soft">{successRate}% success over the last {recent.length} run{recent.length === 1 ? "" : "s"}</span>}
            <button type="button" onClick={() => void loadHistory()} className="ml-auto inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-accent hover:underline">
              <History size={13} aria-hidden /> {historyOpen ? "Hide history" : "Run history & responses"}
            </button>
          </div>
        )}

        {result && (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink"><Globe size={13} className="text-accent" aria-hidden /> What the server answered just now</p>
            <ResponseView run={result} />
          </div>
        )}

        {historyOpen && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-ink">Run history <span className="font-normal text-ink-mute">— click a run to see the full response</span></p>
            {history === null ? (
              <div className="h-16 animate-pulse rounded-xl bg-line/50" />
            ) : history.length === 0 ? (
              <p className="text-xs text-ink-mute">No runs recorded yet.</p>
            ) : (
              <ul className="space-y-1.5">{history.map((r) => <RunRow key={r.id} run={r} />)}</ul>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog open={confirmDelete} onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void remove(); }}
        title={`Delete “${job.name}”?`} message="The job and its run history are removed immediately. This cannot be undone." confirmLabel="Delete job" destructive />
    </li>
  );
}

/**
 * Customer cron jobs on Clyvro's own scheduler — no external cron
 * service. Jobs run whenever Clyvro is active and at least once daily;
 * every run stores the complete server response (status line, headers,
 * body) so you can see exactly what your endpoint said.
 */
export default function CronJobManager() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [body, setBody] = useState("");
  const [interval, setInterval] = useState("1440");
  const [customMinutes, setCustomMinutes] = useState("90");
  const [firstRunLocal, setFirstRunLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/cron-jobs", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't load cron jobs.");
    setData(json as Payload);
  }, []);

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load cron jobs.")); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const intervalMinutes = interval === "custom" ? Number(customMinutes) : Number(interval);
      const res = await fetch("/api/cron-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, url, method, body: method === "POST" ? body : null, intervalMinutes,
          firstRunAt: firstRunLocal ? new Date(firstRunLocal).toISOString() : null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't create the cron job.");
      toast("success", "Cron job created", "Use “Run now” to see the first full response.");
      setName(""); setUrl(""); setBody(""); setFirstRunLocal("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the cron job.");
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const runs = data.jobs.flatMap((j) => j.runs);
    const okRuns = runs.filter((r) => r.ok).length;
    const active = data.jobs.filter((j) => j.job.enabled).length;
    const failing = data.jobs.filter((j) => (j.job.consecutiveFailures ?? 0) > 0 && j.job.enabled).length;
    const avg = runs.length ? Math.round(runs.reduce((a, r) => a + (r.durationMs ?? 0), 0) / runs.length) : null;
    return { active, failing, success: runs.length ? Math.round((okRuns / runs.length) * 100) : null, avg, runs: runs.length };
  }, [data]);

  if (!data && !error) {
    return (
      <section aria-label="Cron jobs" className="animate-pulse space-y-3" aria-busy="true">
        <div className="h-6 w-40 rounded-lg bg-line/70" />
        <div className="h-40 rounded-2xl bg-line/50" />
      </section>
    );
  }

  const atLimit = data ? data.jobs.length >= data.maxCronJobs : false;
  const formOpen = showForm;

  return (
    <section aria-labelledby="cron-jobs-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="cron-jobs-heading" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent"><AlarmClock size={16} aria-hidden /></span> Cron jobs
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Clyvro calls your URLs on a schedule and stores each response. Pick an interval and, if you want, a clock time for the first run.
          </p>
        </div>
        {data?.canWrite && !formOpen && (
          <button type="button" onClick={() => setShowForm(true)} disabled={atLimit} className="button-primary">
            <Plus size={15} aria-hidden /> {atLimit ? "Plan limit reached" : "New cron job"}
          </button>
        )}
      </div>

      {data && (
        <dl className="mt-5 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
          <div className="rounded-2xl border border-line bg-surface p-4"><dt className="text-ink-mute">Jobs</dt><dd className="mt-1 text-2xl font-bold">{data.jobs.length}<span className="text-sm font-medium text-ink-mute"> / {data.maxCronJobs}</span></dd><dd className="text-ink-mute">{data.planName} plan · {stats?.active ?? 0} active</dd></div>
          <div className="rounded-2xl border border-line bg-surface p-4"><dt className="text-ink-mute">Success rate</dt><dd className={`mt-1 text-2xl font-bold ${stats?.success !== null && stats !== null && stats.success < 90 ? "text-warn" : ""}`}>{stats?.success === null || stats === null ? "—" : `${stats.success}%`}</dd><dd className="text-ink-mute">last {stats?.runs ?? 0} recorded runs</dd></div>
          <div className="rounded-2xl border border-line bg-surface p-4"><dt className="text-ink-mute">Average response</dt><dd className="mt-1 text-2xl font-bold">{formatDuration(stats?.avg ?? null)}</dd><dd className="text-ink-mute">request to last byte</dd></div>
          <div className="rounded-2xl border border-line bg-surface p-4"><dt className="text-ink-mute">Needs attention</dt><dd className={`mt-1 text-2xl font-bold ${(stats?.failing ?? 0) > 0 ? "text-bad" : "text-good"}`}>{stats?.failing ?? 0}</dd><dd className="text-ink-mute">jobs failing right now</dd></div>
        </dl>
      )}

      {error && <p role="alert" className="form-error mt-4">{error}</p>}

      {data?.canWrite && formOpen && (
        <form onSubmit={create} aria-busy={busy} className="form-panel mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Plus size={15} className="text-accent" aria-hidden /> New cron job</h3>
            {data.jobs.length > 0 && <button type="button" onClick={() => setShowForm(false)} className="text-xs font-semibold text-ink-mute hover:text-ink">Cancel</button>}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cj-name" className="form-label">Name <span className="text-bad" aria-hidden="true">*</span></label>
              <input id="cj-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Warm the checkout cache" className="form-control mt-1.5" />
            </div>
            <div>
              <label htmlFor="cj-url" className="form-label">URL to call <span className="text-bad" aria-hidden="true">*</span></label>
              <div className="relative mt-1.5">
                <Globe size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
                <input id="cj-url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/api/warm" className="form-control form-control-icon" />
              </div>
            </div>
            <div>
              <span className="form-label">Method</span>
              <div className="mt-1.5 inline-flex rounded-xl border border-line bg-canvas p-1" role="radiogroup" aria-label="HTTP method">
                {["GET", "POST"].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                    className={`min-h-9 rounded-lg px-4 font-mono text-xs font-bold transition ${method === m ? "bg-surface text-ink shadow-sm" : "text-ink-mute hover:text-ink"}`}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="cj-interval" className="form-label">Run every</label>
              <BrandSelect id="cj-interval" value={interval} onChange={setInterval} options={INTERVALS} className="mt-1.5 w-full" />
            </div>
            {interval === "custom" && (
              <div>
                <label htmlFor="cj-custom" className="form-label">Minutes between runs (30–43,200)</label>
                <input id="cj-custom" type="number" min={30} max={43200} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} className="form-control mt-1.5" />
              </div>
            )}
            <div>
              <label htmlFor="cj-first" className="form-label">First run at (optional)</label>
              <input id="cj-first" type="datetime-local" value={firstRunLocal} onChange={(e) => setFirstRunLocal(e.target.value)} className="form-control mt-1.5" />
              <p className="form-hint">Clock time for the first call. Later runs follow the interval from then. Leave empty to start after one interval.</p>
            </div>
            {method === "POST" && (
              <div className="sm:col-span-2">
                <label htmlFor="cj-body" className="form-label">Request body (optional, sent as JSON)</label>
                <textarea id="cj-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2048} placeholder='{"source":"clyvro-cron"}' className="form-control mt-1.5 font-mono text-xs" />
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || atLimit} className="button-primary">
              {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
              {atLimit ? "Plan limit reached" : busy ? "Creating…" : "Create cron job"}
            </button>
            <p className="form-hint !mt-0">Public addresses only — the scanner&apos;s safety boundary applies. POST redirects aren&apos;t followed; the first response is what gets recorded.</p>
          </div>
        </form>
      )}

      {data && data.jobs.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent"><AlarmClock size={22} aria-hidden /></div>
          <h3 className="mt-4 text-sm font-semibold">No cron jobs yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">Create your first scheduled request — keep endpoints warm, trigger webhooks, or monitor availability. Every run saves the full response.</p>
          {data.canWrite && (
            <button type="button" onClick={() => setShowForm(true)} className="button-primary mt-4">
              <Plus size={15} aria-hidden /> Create Cron Job
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {data?.jobs.map((item) => <JobCard key={item.job.id} item={item} canWrite={data.canWrite} onChanged={load} />)}
        </ul>
      )}
    </section>
  );
}
