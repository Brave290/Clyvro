"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { Pagination, useAdminActions, usePaged } from "@/components/app/AdminConsole";

export interface EmailLogRow {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}
export interface EmailLogCounts {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

const KIND_LABEL: Record<string, string> = {
  scan_completed: "Scan completed",
  scan_partial: "Scan partial",
  scan_failed: "Scan failed",
  scan_timed_out: "Scan timed out",
  scheduled_run: "Scheduled run",
  quota_warning: "Quota warning",
  payment_receipt: "Payment receipt",
  payment_abandoned: "Checkout abandoned",
  plan_expiring: "Plan expiring",
  plan_expired: "Plan expired",
  domain_verified: "Domain verified",
  security_incident: "Security incident",
  "security-incident": "Security incident",
  smtp_test: "SMTP test",
  password_reset: "Password reset",
  team_invite: "Team invite",
};

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-good-soft text-good",
  failed: "bg-bad-soft text-bad",
  pending: "bg-warn-soft text-warn",
  skipped_no_mailer: "bg-canvas text-ink-mute",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
  { id: "pending", label: "Pending" },
] as const;

function statusLabel(status: string) {
  if (status === "skipped_no_mailer") return "Waiting for SMTP";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "sent") return "Sent";
  return status;
}

function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind.replace(/[_-]/g, " ");
}

export default function AdminEmailLog({ rows, counts }: { rows: EmailLogRow[]; counts: EmailLogCounts }) {
  const { busy, act } = useAdminActions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "pending") return rows.filter((r) => r.status === "pending" || r.status === "skipped_no_mailer");
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);
  const paged = usePaged(filtered, 15);

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-semibold">Email log</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-mute">
        Every message Clyvro has queued or handed to SMTP since this project started — sent, failed, and still waiting.
        Message bodies (reset links, receipts) are not shown.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          ["Total", counts.total],
          ["Sent", counts.sent],
          ["Failed", counts.failed],
          ["Pending", counts.pending],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-xs text-ink-mute">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={busy !== null || counts.pending === 0}
          className="button-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void act({ action: "email.flushAll" }, "email-flush")}
        >
          {busy === "email-flush"
            ? <LoaderCircle size={16} className="animate-spin" aria-hidden />
            : <Send size={16} aria-hidden />}
          {counts.pending === 0 ? "No pending mail" : `Send all ${counts.pending} pending`}
        </button>
        <p className="text-xs leading-relaxed text-ink-mute">
          Sends every waiting message in one go, then cools down for 2 minutes.
          New mail from a scan or other work still goes out immediately after that action.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter email log">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold ${
              filter === f.id ? "bg-accent text-white" : "border border-line bg-canvas text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-5 text-sm text-ink-mute">
          {rows.length === 0
            ? "No mail has been queued yet. Receipts, resets, invites, and the SMTP test all land here."
            : "Nothing in this filter."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {paged.pageItems.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLE[row.status] ?? "bg-canvas text-ink-mute"}`}>
                {statusLabel(row.status)}
              </span>
              <span className="font-semibold">{kindLabel(row.kind)}</span>
              <span className="min-w-0 truncate text-sm text-ink-soft" title={row.toEmail}>{row.toEmail}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-mute" title={row.subject}>{row.subject}</span>
              <span className="text-xs text-ink-mute">
                {row.sentAt ? <LocalDateTime value={row.sentAt} /> : <LocalDateTime value={row.createdAt} />}
                {row.attempts > 1 ? ` · ${row.attempts} tries` : ""}
              </span>
              {row.lastError && <p className="w-full text-xs text-bad">{row.lastError}</p>}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
    </section>
  );
}
