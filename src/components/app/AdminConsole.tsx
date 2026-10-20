"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import LocalDateTime from "@/components/LocalDateTime";

interface AdminUser { id: string; email: string; name: string | null; isPlatformAdmin: boolean; suspended: boolean; createdAt: string; workspaces: { name: string; role: string }[] }
interface AdminOrg { id: string; name: string; planId: string; planExpiresAt: string | null; adminPlanId: string | null; adminPlanNote: string | null; members: number; scansUsed: number; lastPayment: { status: string; planId: string; at: string } | null }
interface AdminJob { jobId: string; auditId: string; jobStatus: string; auditStatus: string; scanMode: string; targetUrl: string; attempts: number; failureCount: number; lastError: string | null; updatedAt: string }
interface AdminLogRow { id: string; actorEmail: string; action: string; targetType: string | null; targetId: string | null; createdAt: string }
interface LegalRow { slug: string; title: string; draftBody: string; published: boolean; publishedAt: string | null; revisions: number }

export interface AdminData { users: AdminUser[]; orgs: AdminOrg[]; jobs: AdminJob[]; log: AdminLogRow[]; legal: LegalRow[] }

const PLAN_OPTIONS = ["", "freemium", "basic", "pro", "ultra-agency"];
export const ADMIN_PAGE_SIZE = 10;

function useAdminActions() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Action failed.");
      toast("success", "Done", "The admin action was recorded in the audit log.");
      router.refresh();
    } catch (err) {
      toast("error", "Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }
  return { busy, act };
}

/** Client-side pagination controls for admin lists. */
export function Pagination({ page, totalPages, total, onPage }: {
  page: number; totalPages: number; total: number; onPage: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return total > 0 ? <p className="mt-3 text-xs text-ink-mute">{total} item{total === 1 ? "" : "s"}</p> : null;
  }
  return (
    <nav className="mt-4 flex flex-wrap items-center gap-3" aria-label="Pagination">
      <button type="button" className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs" disabled={page <= 1}
        onClick={() => onPage(page - 1)}>
        <ChevronLeft size={13} aria-hidden /> Previous
      </button>
      <span className="text-xs font-semibold text-ink-soft" role="status">
        Page {page} of {totalPages} · {total} item{total === 1 ? "" : "s"}
      </span>
      <button type="button" className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs" disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}>
        Next <ChevronRight size={13} aria-hidden />
      </button>
    </nav>
  );
}

function usePaged<T>(items: T[], pageSize = ADMIN_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { pageItems, page: safePage, setPage, totalPages, total: items.length };
}

function SectionShell({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-bold">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-mute">{note}</p>}
      {children}
    </section>
  );
}

export function AdminOverview({ data }: { data: AdminData }) {
  const cards = [
    { label: "Users", value: data.users.length, href: "/admin/users", note: `${data.users.filter((u) => u.suspended).length} suspended` },
    { label: "Workspaces", value: data.orgs.length, href: "/admin/workspaces", note: `${data.orgs.filter((o) => o.adminPlanId).length} with plan override` },
    { label: "Scan jobs", value: data.jobs.length, href: "/admin/jobs", note: `${data.jobs.filter((j) => ["failed", "timed_out"].includes(j.auditStatus)).length} need attention` },
    { label: "Admin actions", value: data.log.length, href: "/admin/audit-log", note: "Latest activity in the audit log" },
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}
            className="rounded-2xl border border-line bg-surface p-5 transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-mute">{c.label}</p>
            <p className="mt-2 text-3xl font-bold">{c.value}</p>
            <p className="mt-1 text-xs text-ink-mute">{c.note}</p>
          </Link>
        ))}
      </div>
      <SectionShell title="Recent admin activity" note="The five most recent recorded actions. Full history lives in the audit log.">
        <ul className="mt-3 space-y-2">
          {data.log.slice(0, 5).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="font-semibold">{r.action}</span>
              <span className="text-ink-mute">{r.actorEmail}</span>
              <span className="ml-auto text-xs text-ink-mute"><LocalDateTime value={r.createdAt} /></span>
            </li>
          ))}
          {data.log.length === 0 && <li className="text-sm text-ink-mute">No admin actions recorded yet.</li>}
        </ul>
      </SectionShell>
    </div>
  );
}

export function AdminUsers({ users }: { users: AdminUser[] }) {
  const { busy, act } = useAdminActions();
  const paged = usePaged(users);
  return (
    <SectionShell title="Users">
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
            <th className="px-4 py-3">User</th><th className="px-4 py-3">Workspaces</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {paged.pageItems.map((u) => (
              <tr key={u.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3"><p className="font-semibold">{u.email}</p><p className="text-xs text-ink-mute">{u.name ?? "—"} · joined <LocalDateTime value={u.createdAt} /></p></td>
                <td className="px-4 py-3 text-xs">{u.workspaces.map((w) => `${w.name} (${w.role})`).join(", ") || "—"}</td>
                <td className="px-4 py-3">{u.isPlatformAdmin ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">Admin</span> : u.suspended ? <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-bad">Suspended</span> : <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">Active</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                      onClick={() => void act({ action: "user.suspend", userId: u.id, suspended: !u.suspended }, "suspend")}>
                      {u.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                    <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs text-bad"
                      onClick={() => { if (window.confirm(`Delete ${u.email} permanently? This follows the safe-deletion rules and cannot be undone.`)) void act({ action: "user.delete", userId: u.id, confirm: true }, "delete"); }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
    </SectionShell>
  );
}

export function AdminOrgs({ orgs }: { orgs: AdminOrg[] }) {
  const { busy, act } = useAdminActions();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const paged = usePaged(orgs);
  return (
    <SectionShell title="Workspaces & plans" note="Purchased plan and administrator override are separate. An override is always labelled and logged.">
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
            <th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Purchased</th><th className="px-4 py-3">Admin override</th><th className="px-4 py-3">Usage</th>
          </tr></thead>
          <tbody>
            {paged.pageItems.map((o) => (
              <tr key={o.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3"><p className="font-semibold">{o.name}</p><p className="text-xs text-ink-mute">{o.members} member(s)</p></td>
                <td className="px-4 py-3 text-xs">{o.planId}{o.planExpiresAt ? <> until <LocalDateTime value={o.planExpiresAt} /></> : " (no expiry)"}{o.lastPayment ? <><br />Last payment: {o.lastPayment.status} · {o.lastPayment.planId}</> : null}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select aria-label={`Plan override for ${o.name}`} className="form-control !w-40" value={overrides[o.id] ?? o.adminPlanId ?? ""}
                      onChange={(e) => setOverrides({ ...overrides, [o.id]: e.target.value })}>
                      {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p === "" ? "None (use purchased)" : p}</option>)}
                    </select>
                    <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                      onClick={() => void act({ action: "org.planOverride", organizationId: o.id, planId: (overrides[o.id] ?? o.adminPlanId) || null, note: "Set from Admin Control Center" }, "override")}>
                      Apply
                    </button>
                  </div>
                  {o.adminPlanId && <p className="mt-1 text-xs font-semibold text-accent">Override active: {o.adminPlanId}{o.adminPlanNote ? ` — ${o.adminPlanNote}` : ""}</p>}
                </td>
                <td className="px-4 py-3 text-xs">{o.scansUsed} scan(s) charged</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
    </SectionShell>
  );
}

export function AdminJobs({ jobs }: { jobs: AdminJob[] }) {
  const { busy, act } = useAdminActions();
  const paged = usePaged(jobs);
  return (
    <SectionShell title="Scan jobs">
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
            <th className="px-4 py-3">Target</th><th className="px-4 py-3">Job / audit</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Action</th>
          </tr></thead>
          <tbody>
            {paged.pageItems.map((j) => (
              <tr key={j.jobId} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3"><p className="max-w-64 truncate font-semibold" title={j.targetUrl}>{j.targetUrl}</p><p className="text-xs text-ink-mute">{j.scanMode} mode{j.lastError ? ` · ${j.lastError}` : ""}</p></td>
                <td className="px-4 py-3 text-xs">{j.jobStatus} / {j.auditStatus}</td>
                <td className="px-4 py-3 text-xs">{j.attempts} (failures {j.failureCount})</td>
                <td className="px-4 py-3 text-xs"><LocalDateTime value={j.updatedAt} /></td>
                <td className="px-4 py-3">
                  {["failed", "timed_out", "cancelled"].includes(j.auditStatus) && (
                    <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                      onClick={() => void act({ action: "job.retry", auditId: j.auditId }, "retry")}>Retry</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
    </SectionShell>
  );
}

export function AdminLegal({ legal: rows }: { legal: LegalRow[] }) {
  const { busy, act } = useAdminActions();
  const [legalSlug, setLegalSlug] = useState(rows[0]?.slug ?? "refund");
  const legal = rows.find((l) => l.slug === legalSlug) ?? rows[0];
  const [legalTitle, setLegalTitle] = useState(legal?.title ?? "");
  const [legalBody, setLegalBody] = useState(legal?.draftBody ?? "");
  return (
    <SectionShell title="Legal pages" note="Drafts never affect the public site until published. Publishing keeps revision history.">
      <div className="form-panel mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="legal-slug" className="form-label">Page</label>
            <select id="legal-slug" className="form-control mt-1.5" value={legalSlug}
              onChange={(e) => {
                const next = rows.find((l) => l.slug === e.target.value);
                setLegalSlug(e.target.value);
                setLegalTitle(next?.title ?? "");
                setLegalBody(next?.draftBody ?? "");
              }}>
              {rows.map((l) => <option key={l.slug} value={l.slug}>{l.slug} {l.published ? "(published)" : "(not published)"}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="legal-title" className="form-label">Title</label>
            <input id="legal-title" className="form-control mt-1.5" value={legalTitle} onChange={(e) => setLegalTitle(e.target.value)} />
          </div>
        </div>
        <label htmlFor="legal-body" className="form-label mt-4 block">Draft (plain text — a line starting a new paragraph; headings are plain lines)</label>
        <textarea id="legal-body" className="form-control mt-1.5 min-h-64" value={legalBody} onChange={(e) => setLegalBody(e.target.value)} />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy !== null} className="button-secondary"
            onClick={() => void act({ action: "legal.saveDraft", slug: legalSlug, title: legalTitle, body: legalBody }, "legal-save")}>
            {busy === "legal-save" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Save draft
          </button>
          <button type="button" disabled={busy !== null} className="button-primary"
            onClick={() => { if (window.confirm(`Publish the ${legalSlug} page now? The current public version is kept in revision history.`)) void act({ action: "legal.publish", slug: legalSlug, confirm: true }, "legal-publish"); }}>
            Publish
          </button>
        </div>
        {legal && <p className="form-hint mt-3">{legal.published ? <>Published <LocalDateTime value={legal.publishedAt ?? ""} /> · {legal.revisions} revision(s) kept.</> : "Not published yet — the built-in default (refund) or existing page is shown."}</p>}
      </div>
    </SectionShell>
  );
}

export function AdminLog({ log }: { log: AdminLogRow[] }) {
  const paged = usePaged(log);
  return (
    <SectionShell title="Admin audit log">
      <ul className="mt-3 space-y-2">
        {paged.pageItems.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="font-semibold">{r.action}</span>
            <span className="text-ink-mute">{r.actorEmail}</span>
            {r.targetType && <span className="text-xs text-ink-mute">{r.targetType}: {r.targetId}</span>}
            <span className="ml-auto text-xs text-ink-mute"><LocalDateTime value={r.createdAt} /></span>
          </li>
        ))}
        {log.length === 0 && <li className="text-sm text-ink-mute">No admin actions recorded yet.</li>}
      </ul>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
    </SectionShell>
  );
}

export function AdminLegalIcon() {
  return <ShieldCheck size={18} className="text-accent" aria-hidden />;
}
