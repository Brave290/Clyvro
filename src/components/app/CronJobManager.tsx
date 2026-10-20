"use client";
import { useCallback, useEffect, useState } from "react";
import { AlarmClock, LoaderCircle, Play, Plus, Trash2 } from "lucide-react";
import { BrandSelect } from "@/components/ui";
import LocalDateTime from "@/components/LocalDateTime";
import { useToast } from "@/components/Toast";

interface CronRun { id: string; status: number | null; ok: boolean; durationMs: number | null; error: string | null; createdAt: string }
interface CronJob {
  id: string; name: string; url: string; method: string; intervalMinutes: number; enabled: boolean;
  nextRunAt: string; lastRunAt: string | null; lastStatus: number | null; lastError: string | null;
}
interface Item { job: CronJob; runs: CronRun[] }
interface Payload { jobs: Item[]; planName: string; maxCronJobs: number; canWrite: boolean }

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

function intervalLabel(min: number): string {
  if (min % 1440 === 0) return min === 1440 ? "Daily" : `Every ${min / 1440} days`;
  if (min % 60 === 0) return min === 60 ? "Hourly" : `Every ${min / 60} hours`;
  return `Every ${min} minutes`;
}

/**
 * Customer cron jobs on Clyvro's own scheduler — no external cron
 * service. Jobs run whenever Clyvro is active and at least once daily;
 * the copy below says exactly that (best-effort timing).
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
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/cron-jobs");
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
        body: JSON.stringify({ name, url, method, body: method === "POST" ? body : null, intervalMinutes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't create the cron job.");
      toast("success", "Cron job created", "It will run on the schedule you picked.");
      setName(""); setUrl(""); setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the cron job.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(job: CronJob) {
    await fetch(`/api/cron-jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !job.enabled }) });
    await load();
  }

  async function remove(job: CronJob) {
    await fetch(`/api/cron-jobs/${job.id}`, { method: "DELETE" });
    toast("success", "Cron job deleted");
    await load();
  }

  async function runNow(job: CronJob) {
    setRunningId(job.id);
    try {
      const res = await fetch(`/api/cron-jobs/${job.id}/run`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) toast("success", "Cron job ran", `The site answered HTTP ${json.status}.`);
      else toast("error", "Cron job ran with a problem", json?.status ? `HTTP ${json.status}` : "No response — see the run history.");
      await load();
    } finally {
      setRunningId(null);
    }
  }

  if (!data && !error) {
    return (
      <section aria-label="Cron jobs" className="animate-pulse space-y-3" aria-busy="true">
        <div className="h-6 w-40 rounded-lg bg-line/70" />
        <div className="h-40 rounded-2xl bg-line/50" />
      </section>
    );
  }

  const atLimit = data ? data.jobs.length >= data.maxCronJobs : false;

  return (
    <section aria-labelledby="cron-jobs-heading">
      <h2 id="cron-jobs-heading" className="flex items-center gap-2 font-semibold">
        <AlarmClock size={17} className="text-accent" aria-hidden /> Cron jobs
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Clyvro pings your URLs on your schedule — keep-alive hooks, cache warmers, your own endpoints.
        Powered by our own scheduler (no external cron service): jobs run whenever Clyvro is active and at
        least once a day, so treat times as best-effort, usually within the hour for hourly jobs.
        {data && <> Your {data.planName} plan includes {data.maxCronJobs} cron job{data.maxCronJobs === 1 ? "" : "s"} ({data.jobs.length} used).</>}
      </p>
      {error && <p role="alert" className="form-error mt-4">{error}</p>}

      {data?.canWrite && (
        <form onSubmit={create} aria-busy={busy} className="form-panel mt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Plus size={15} className="text-accent" aria-hidden /> New cron job</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cj-name" className="form-label">Name <span className="text-bad" aria-hidden="true">*</span></label>
              <input id="cj-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Warm the checkout cache" className="form-control mt-1.5" />
            </div>
            <div>
              <label htmlFor="cj-url" className="form-label">URL to call <span className="text-bad" aria-hidden="true">*</span></label>
              <input id="cj-url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/api/warm" className="form-control mt-1.5" />
            </div>
            <div>
              <label htmlFor="cj-method" className="form-label">Method</label>
              <BrandSelect id="cj-method" value={method} onChange={setMethod} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} className="mt-1.5 w-full" />
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
            {method === "POST" && (
              <div className="sm:col-span-2">
                <label htmlFor="cj-body" className="form-label">Request body (optional, sent as JSON)</label>
                <textarea id="cj-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2048} placeholder='{"source":"clyvro-cron"}' className="form-control mt-1.5" />
              </div>
            )}
          </div>
          <button type="submit" disabled={busy || atLimit} className="button-primary mt-5">
            {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
            {atLimit ? "Plan limit reached" : busy ? "Creating…" : "Create cron job"}
          </button>
          <p className="form-hint mt-2">Public addresses only — the same safety boundary as the scanner applies. POST redirects aren&apos;t followed; the first response is what gets recorded.</p>
        </form>
      )}

      {data && data.jobs.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-line bg-surface p-6 text-sm text-ink-soft">No cron jobs yet. Create one above and Clyvro will start calling it on schedule.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {data?.jobs.map(({ job, runs }) => (
            <li key={job.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" title={job.name}>{job.name}</span>
                  <span className="block truncate text-xs text-ink-mute" title={job.url}>{job.method} {job.url}</span>
                </span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{intervalLabel(job.intervalMinutes)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${job.enabled ? "bg-good-soft text-good" : "bg-canvas text-ink-mute"}`}>{job.enabled ? "Enabled" : "Paused"}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {job.lastRunAt ? <>Last run <LocalDateTime value={job.lastRunAt} /> — {job.lastStatus !== null ? `HTTP ${job.lastStatus}` : job.lastError ?? "failed"}.</> : "Hasn't run yet."}{" "}
                {job.enabled && <>Next run around <LocalDateTime value={job.nextRunAt} />.</>}
              </p>
              {runs.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Recent runs">
                  {runs.map((r) => (
                    <li key={r.id} title={`${r.status !== null ? `HTTP ${r.status}` : r.error ?? "failed"}${r.durationMs !== null ? ` · ${r.durationMs}ms` : ""}`}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                      {r.status ?? "ERR"}
                    </li>
                  ))}
                </ul>
              )}
              {data.canWrite && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void runNow(job)} disabled={runningId === job.id}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60">
                    {runningId === job.id ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />} Run now
                  </button>
                  <button type="button" onClick={() => void toggle(job)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-semibold transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                    {job.enabled ? "Pause" : "Resume"}
                  </button>
                  <button type="button" onClick={() => void remove(job)} aria-label={`Delete ${job.name}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-bad transition hover:bg-bad-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                    <Trash2 size={13} aria-hidden /> Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
