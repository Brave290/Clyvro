"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandSelect, type BrandSelectOption } from "@/components/ui";
import LocalDateTime from "@/components/LocalDateTime";
import { useToast } from "@/components/Toast";

interface ProjectOption { id: string; name: string; siteUrl: string }
interface ScheduleRow {
  id: string; projectId: string; projectName: string; siteUrl: string;
  enabled: boolean; cadence: "daily" | "weekly"; weekday: number | null; timeZone: string; locale: string;
  nextRunAt: string; lastRunAt: string | null; lastError: string | null;
}
interface Data { schedules: ScheduleRow[]; projects: ProjectOption[]; monitoring: boolean; canManage: boolean }
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function errorMessage(res: Response) {
  const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
  return body.error?.message ?? "The schedule could not be updated.";
}

export default function ScheduleManager() {
  const { toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [projectId, setProjectId] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("weekly");
  const [weekday, setWeekday] = useState("1");
  const [timeZone, setTimeZone] = useState("UTC");
  const [busy, setBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorMessage(res));
      setData(await res.json() as Data);
    } catch (error) {
      toast("error", "Schedules unavailable", error instanceof Error ? error.message : undefined);
    }
  }, [toast]);
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setWeekday(String(new Date().getDay()));
    void load();
  }, [load]);

  const scheduledProjects = useMemo(() => new Set(data?.schedules.map((schedule) => schedule.projectId) ?? []), [data]);
  const availableProjects = data?.projects.filter((project) => !scheduledProjects.has(project.id)) ?? [];
  const projectOptions: BrandSelectOption[] = availableProjects.map((project) => ({ value: project.id, label: `${project.name} · ${project.siteUrl}` }));
  const cadenceOptions: BrandSelectOption[] = [{ value: "weekly", label: "Weekly" }, { value: "daily", label: "Daily" }];
  const weekdayOptions: BrandSelectOption[] = DAYS.map((day, index) => ({ value: String(index), label: day }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, cadence, weekday: Number(weekday), timeZone, locale: navigator.language }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      setProjectId("");
      toast("success", "Schedule created", "The next run is queued by the daily dispatcher.");
      await load();
    } catch (error) {
      toast("error", "Schedule not created", error instanceof Error ? error.message : undefined);
    } finally { setBusy(false); }
  }

  async function update(id: string, action: "toggle" | "delete", enabled?: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      if (!res.ok) throw new Error(await errorMessage(res));
      toast("success", action === "delete" ? "Schedule removed" : enabled ? "Schedule resumed" : "Schedule paused");
      await load();
    } catch (error) {
      toast("error", "Schedule not updated", error instanceof Error ? error.message : undefined);
    } finally { setBusy(false); }
  }

  if (!data) return <section className="form-panel mt-6"><p className="text-sm text-ink-mute">Loading monitoring schedules…</p></section>;

  return (
    <section className="form-panel mt-6" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Scheduled monitoring</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">Schedules use your device time zone and are stored as UTC instants. Clyvro checks for due work once each day; this is a low-cost dispatcher, not a keep-alive ping for Neon.</p>
        </div>
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold">Daily dispatch</span>
      </div>

      {!data.monitoring && <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">Scheduled scans are included with the Pro and Ultra Agency plan entitlements. Current plan settings remain in preview and no plan payment is being taken. <a className="font-semibold text-accent hover:underline" href="/pricing">View plan details</a>.</div>}

      {data.monitoring && data.canManage && (
        <form onSubmit={create} className="mt-5 grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="form-label">Website</span><BrandSelect id="schedule-project" value={projectId} onChange={setProjectId} options={projectOptions} placeholder="Choose a saved website" className="mt-1.5 w-full" disabled={busy || availableProjects.length === 0} /></label>
          <label className="block"><span className="form-label">Frequency</span><BrandSelect id="schedule-cadence" value={cadence} onChange={(value) => { if (value === "daily" || value === "weekly") setCadence(value); }} options={cadenceOptions} className="mt-1.5 w-full" disabled={busy} /></label>
          {cadence === "weekly" && <label className="block"><span className="form-label">Run day ({timeZone})</span><BrandSelect id="schedule-weekday" value={weekday} onChange={setWeekday} options={weekdayOptions} className="mt-1.5 w-full" disabled={busy} /></label>}
          <div className="flex items-end sm:col-span-2"><button className="button-primary" type="submit" disabled={busy || !projectId || availableProjects.length === 0}>{busy ? "Saving…" : "Create schedule"}</button></div>
          {availableProjects.length === 0 && <p className="text-sm text-ink-mute sm:col-span-2">No unscheduled active websites are available in this workspace.</p>}
        </form>
      )}
      {data.monitoring && !data.canManage && <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">Only workspace owners and admins can create or change schedules.</p>}

      <div className="mt-5 space-y-3">
        {data.schedules.length === 0 ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-ink-mute">No scheduled scans yet. You can still run one-off scans from a saved website.</p> : data.schedules.map((schedule) => (
          <article key={schedule.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{schedule.projectName}</h3>
                <p className="mt-0.5 truncate text-xs text-ink-mute">{schedule.siteUrl}</p>
                <p className="mt-2 text-sm text-ink-soft">{schedule.cadence === "daily" ? "Daily" : `Weekly on ${DAYS[schedule.weekday ?? 0]}`} · {schedule.timeZone} · next <LocalDateTime value={schedule.nextRunAt} format="datetime" /></p>
                {schedule.lastRunAt && <p className="mt-1 text-xs text-ink-mute">Last queued <LocalDateTime value={schedule.lastRunAt} format="datetime" /></p>}
                {schedule.lastError && <p className="mt-2 rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-xs text-ink-soft">{schedule.lastError}</p>}
              </div>
              {data.canManage && <div className="flex shrink-0 gap-2">
                <button type="button" disabled={busy} onClick={() => void update(schedule.id, "toggle", !schedule.enabled)} className="button-secondary">{schedule.enabled ? "Pause" : "Resume"}</button>
                {confirmRemoveId === schedule.id ? <><button type="button" disabled={busy} onClick={() => void update(schedule.id, "delete")} className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm remove</button><button type="button" disabled={busy} onClick={() => setConfirmRemoveId(null)} className="button-secondary">Cancel</button></> : <button type="button" disabled={busy} onClick={() => setConfirmRemoveId(schedule.id)} className="rounded-xl border border-danger/25 px-3 py-2 text-sm font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50">Remove</button>}
              </div>}
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${schedule.enabled ? "bg-success/10 text-success" : "bg-surface-muted text-ink-mute"}`}>{schedule.enabled ? "Enabled" : "Paused"}</span>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-mute">The daily Vercel Cron job does not run extra checks to keep Neon awake. Neon can scale to zero between real requests. cron-job.org is documented as a fallback only; adding a second live dispatcher would duplicate calls and increase cost.</p>
    </section>
  );
}
