"use client";
import { useMemo, useState } from "react";
import { ArrowUp, Lightbulb } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { BrandSelect } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { AdminFeatureRequestView, FeatureStatus } from "@/lib/services/feature-requests";

// Mirrors FEATURE_STATUSES / FEATURE_STATUS_LABELS in the service
// (kept local so no server code enters the client bundle).
const FEATURE_STATUSES: FeatureStatus[] = ["requested", "planned", "in_progress", "shipped", "not_planned"];
const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  requested: "Requested",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  not_planned: "Not planned",
};

const STATUS_STYLE: Record<FeatureStatus, string> = {
  requested: "bg-canvas text-ink-soft",
  planned: "bg-accent-soft text-accent",
  in_progress: "bg-warn-soft text-warn",
  shipped: "bg-good-soft text-good",
  not_planned: "bg-bad-soft text-bad",
};

/**
 * Admin → Feature requests: the community board with upvotes — the
 * roadmap signal. Sorted by votes, workspace names visible (admin
 * only), status managed inline. "Shipped" is set only when the
 * feature is actually live.
 */
export default function AdminFeatureRequests({
  initial,
  hot = [],
}: {
  initial: AdminFeatureRequestView[];
  hot?: { id: string; title: string; votes: number }[];
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: rows.length,
    votes: rows.reduce((n, r) => n + r.votes, 0),
    awaiting: rows.filter((r) => r.status === "requested").length,
    shipped: rows.filter((r) => r.status === "shipped").length,
  }), [rows]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  async function setStatus(row: AdminFeatureRequestView, status: FeatureStatus) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/feature-requests/${row.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't update the status.");
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
      toast("success", "Status updated", `“${row.title}” is now ${FEATURE_STATUS_LABELS[status]}.`);
    } catch (err) {
      toast("error", "Update failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Feature requests">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Lightbulb size={19} className="text-accent" aria-hidden /> Feature requests
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
        What users are asking for, ranked by upvotes — the loudest signal first. Triage honestly:
        only mark <strong className="text-ink">Shipped</strong> when it&apos;s actually live (and add a changelog entry).
      </p>

      {hot.length > 0 && (
        <div className="mt-5 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
          <h3 className="text-sm font-semibold">Top requested this month</h3>
          <ul className="mt-2 space-y-1.5">
            {hot.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <span className="font-bold text-accent">#{i + 1}</span>
                <span className="flex-1 truncate font-medium">{h.title}</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft">
                  <ArrowUp size={12} aria-hidden /> {h.votes}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-mute">
            Newest momentum, last 30 days. When you mark one Shipped, everyone who voted gets a notification.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Requests", value: stats.total },
          { label: "Total upvotes", value: stats.votes },
          { label: "Awaiting triage", value: stats.awaiting },
          { label: "Shipped", value: stats.shipped },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-mute">{s.label}</p>
            <p className="mt-1 text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {["all", ...FEATURE_STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              filter === s ? "bg-accent text-white" : "bg-canvas text-ink-soft hover:text-ink"
            }`}
          >
            {s === "all" ? "All" : FEATURE_STATUS_LABELS[s as FeatureStatus]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-mute">
          {rows.length === 0
            ? "No feature requests yet. They appear here the moment a user posts one on /app/feature-requests."
            : "Nothing with this status right now."}
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {visible.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid min-w-14 shrink-0 place-items-center rounded-xl bg-canvas px-2 py-2 text-center">
                  <span className="flex items-center gap-1 text-base font-bold leading-none">
                    <ArrowUp size={14} className="text-accent" aria-hidden />{r.votes}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-mute">votes</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-ink">{r.title}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[r.status]}`}>
                      {FEATURE_STATUS_LABELS[r.status]}
                    </span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{r.category}</span>
                  </span>
                  {r.details && <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{r.details}</span>}
                  <span className="mt-1 block text-xs text-ink-mute">
                    {r.workspaceName} · <LocalDateTime value={r.createdAt} />
                  </span>
                </span>
                <span className="w-44 shrink-0">
                  <BrandSelect
                    id={`fr-status-${r.id}`}
                    value={r.status}
                    disabled={busyId === r.id}
                    onChange={(v) => void setStatus(r, v as FeatureStatus)}
                    options={FEATURE_STATUSES.map((s) => ({ value: s, label: FEATURE_STATUS_LABELS[s] }))}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
