"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import LocalDateTime from "@/components/LocalDateTime";
import { BrandSelect } from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/Dialog";

interface AdminUser { id: string; email: string; name: string | null; isPlatformAdmin: boolean; suspended: boolean; isOwner?: boolean; protectedAccount?: boolean; createdAt: string; workspaces: { name: string; role: string }[] }
interface AdminOrg { id: string; name: string; planId: string; planExpiresAt: string | null; adminPlanId: string | null; adminPlanNote: string | null; members: number; scansUsed: number; projects?: { id: string; name: string; siteUrl: string }[]; lastPayment: { status: string; planId: string; at: string } | null }
interface AdminJob { jobId: string; auditId: string; jobStatus: string; auditStatus: string; scanMode: string; targetUrl: string; attempts: number; failureCount: number; lastError: string | null; updatedAt: string }
interface AdminLogRow { id: string; actorEmail: string; action: string; targetType: string | null; targetId: string | null; createdAt: string }
interface LegalRow { slug: string; title: string; draftBody: string; published: boolean; publishedAt: string | null; revisions: number }

export interface AdminData { users: AdminUser[]; orgs: AdminOrg[]; jobs: AdminJob[]; log: AdminLogRow[]; legal: LegalRow[] }

const PLAN_OPTIONS = ["", "freemium", "basic", "pro", "ultra-agency"];
export const ADMIN_PAGE_SIZE = 10;

export function useAdminActions() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(payload: Record<string, unknown>, label: string): Promise<Record<string, unknown> | null> {
    setBusy(label);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Action failed.");
      toast("success", "Done", "The admin action was recorded in the audit log.");
      router.refresh();
      return json && typeof json === "object" ? json as Record<string, unknown> : {};
    } catch (err) {
      toast("error", "Action failed", err instanceof Error ? err.message : undefined);
      return null;
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

export function usePaged<T>(items: T[], pageSize = ADMIN_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { pageItems, page: safePage, setPage, totalPages, total: items.length };
}

export function SectionShell({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="text-lg font-bold">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-mute">{note}</p>}
      {children}
    </section>
  );
}

export function AdminOverview({ data, cron, features }: {
  data: AdminData;
  cron?: { runs: number; lastTrigger: string | null; lastAt: string | null };
  features?: { total: number; votes: number; awaiting: number; top: { id: string; title: string; votes: number; status: string }[] };
}) {
  const cards = [
    { label: "Users", value: data.users.length, href: "/admin/users", note: `${data.users.filter((u) => u.suspended).length} suspended` },
    { label: "Workspaces", value: data.orgs.length, href: "/admin/workspaces", note: `${data.orgs.filter((o) => o.adminPlanId).length} with plan override` },
    { label: "Scan jobs", value: data.jobs.length, href: "/admin/jobs", note: `${data.jobs.filter((j) => ["failed", "timed_out"].includes(j.auditStatus)).length} need attention` },
    { label: "Feature requests", value: features?.total ?? 0, href: "/admin/feature-requests", note: features ? `${features.votes} upvotes · ${features.awaiting} awaiting triage` : "Community board" },
    { label: "Admin actions", value: data.log.length, href: "/admin/audit-log", note: "Latest activity in the audit log" },
    { label: "Cron runs", value: cron?.runs ?? 0, href: "/admin/cron", note: cron?.lastAt ? `Last: ${cron.lastTrigger ?? "unknown"}` : "No dispatcher runs yet" },
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
      {features && features.top.length > 0 && (
        <SectionShell title="Top-voted feature requests" note="What users want most, by upvotes. Triage and set statuses on the Feature requests page.">
          <ul className="mt-3 space-y-2">
            {features.top.map((r) => (
              <li key={r.id}>
                <Link href="/admin/feature-requests"
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                  <span className="font-semibold">{r.title}</span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold text-ink-soft">▲ {r.votes} votes</span>
                  <span className="ml-auto text-xs capitalize text-ink-mute">{r.status.replace("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionShell>
      )}
      <SectionShell title="Recent admin activity" note="The three most recent recorded actions. Full history lives in the audit log.">
        <ul className="mt-3 space-y-2">
          {data.log.slice(0, 3).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="font-semibold">{r.action}</span>
              <span className="text-ink-mute">{r.actorEmail}</span>
              <span className="ml-auto text-xs text-ink-mute"><LocalDateTime value={r.createdAt} /></span>
            </li>
          ))}
          {data.log.length === 0 && <li className="text-sm text-ink-mute">No admin actions recorded yet.</li>}
          {data.log.length > 3 && (
            <li className="pt-1"><Link href="/admin/audit-log" className="inline-flex min-h-8 items-center text-sm font-semibold text-accent hover:underline">View previous — {data.log.length - 3} more in the audit log →</Link></li>
          )}
        </ul>
      </SectionShell>
    </div>
  );
}

export function AdminUsers({ users }: { users: AdminUser[] }) {
  const { busy, act } = useAdminActions();
  const paged = usePaged(users);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
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
                <td className="px-4 py-3">{u.isOwner ? <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Owner</span> : u.isPlatformAdmin ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">Admin</span> : u.suspended ? <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-bad">Suspended</span> : <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">Active</span>}</td>
                <td className="px-4 py-3">
                  {u.protectedAccount ? (
                    <span className="text-xs font-semibold text-ink-mute">Protected — can&apos;t be suspended or deleted</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                        onClick={() => void act({ action: "user.suspend", userId: u.id, suspended: !u.suspended }, "suspend")}>
                        {u.suspended ? "Unsuspend" : "Suspend"}
                      </button>
                      <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs text-bad"
                        onClick={() => setDeleteTarget(u)}>
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void act({ action: "user.delete", userId: deleteTarget.id, confirm: true }, "delete");
          setDeleteTarget(null);
        }}
        title="Delete this user?"
        message={`Delete ${deleteTarget?.email ?? "this user"} permanently? This follows the safe-deletion rules (sole-owner workspaces are removed, shared workspaces keep their history) and cannot be undone.`}
        confirmLabel="Delete user"
        destructive
      />
    </SectionShell>
  );
}

const DURATION_OPTIONS = [
  { value: "unlimited", label: "Unlimited (life)" },
  { value: "month", label: "1 month" },
  { value: "year", label: "1 year" },
];

export function AdminOrgs({ orgs }: { orgs: AdminOrg[] }) {
  const { busy, act } = useAdminActions();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [transferFor, setTransferFor] = useState<{ id: string; name: string } | null>(null);
  const [transferEmail, setTransferEmail] = useState("");
  const paged = usePaged(orgs);
  return (
    <SectionShell title="Workspaces & plans" note="Applying a plan writes their billing: Pro/Basic/Ultra plus unlimited, 1 month, or 1 year. Unlimited never asks them to pay. Timed grants show the end date, then return to Freemium. Transfer moves a project — with its scans and schedules — to another Clyvro account's workspace (the recipient must already have an account).">
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
            <th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3">Grant plan</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Projects</th>
          </tr></thead>
          <tbody>
            {paged.pageItems.map((o) => (
              <tr key={o.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3"><p className="font-semibold">{o.name}</p><p className="text-xs text-ink-mute">{o.members} member(s)</p></td>
                <td className="px-4 py-3 text-xs">{o.planId}{o.planExpiresAt ? <> until <LocalDateTime value={o.planExpiresAt} /></> : " (no expiry)"}{o.lastPayment ? <><br />Last payment: {o.lastPayment.status} · {o.lastPayment.planId}</> : null}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <BrandSelect id={`plan-override-${o.id}`} className="w-40 shrink-0" value={overrides[o.id] ?? o.adminPlanId ?? ""}
                      onChange={(v) => setOverrides({ ...overrides, [o.id]: v })}
                      options={PLAN_OPTIONS.map((p) => ({ value: p, label: p === "" ? "Clear grant label" : p }))} />
                    <BrandSelect id={`plan-duration-${o.id}`} className="w-44 shrink-0" value={durations[o.id] ?? "unlimited"}
                      onChange={(v) => setDurations({ ...durations, [o.id]: v })}
                      options={DURATION_OPTIONS} />
                    <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                      onClick={() => void act({ action: "org.planOverride", organizationId: o.id, planId: (overrides[o.id] ?? o.adminPlanId) || null, duration: durations[o.id] ?? "unlimited", note: "Set from Admin Control Center" }, "override")}>
                      Apply
                    </button>
                  </div>
                  {o.adminPlanId && <p className="mt-1 text-xs font-semibold text-accent">Grant: {o.adminPlanId}{o.adminPlanNote ? ` — ${o.adminPlanNote}` : ""}</p>}
                </td>
                <td className="px-4 py-3 text-xs">{o.scansUsed} scan(s) charged</td>
                <td className="px-4 py-3">
                  {(o.projects ?? []).length === 0 ? <span className="text-xs text-ink-mute">No projects</span> : (
                    <ul className="space-y-1.5">
                      {(o.projects ?? []).map((p) => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold" title={p.name}>{p.name}</span>
                            <span className="block max-w-44 truncate text-[11px] text-ink-mute" title={p.siteUrl}>{p.siteUrl}</span>
                          </span>
                          <button type="button" disabled={busy !== null} className="button-secondary ml-auto !min-h-8 shrink-0 !px-2.5 !py-1 text-[11px]"
                            onClick={() => { setTransferFor({ id: p.id, name: p.name }); setTransferEmail(""); }}>
                            Transfer
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
      <Dialog open={transferFor !== null} onClose={() => setTransferFor(null)}
        title={transferFor ? `Transfer “${transferFor.name}”` : "Transfer project"} eyebrow="Clyvro · project handover">
        <p className="text-sm leading-relaxed text-ink-soft">
          The project — with its scans, schedules and share links — moves to the workspace owned by the
          Clyvro account under this email. The recipient must already have an account, and the transfer
          is recorded in the admin audit log.
        </p>
        <label htmlFor="transfer-email" className="form-label mt-4 block">Recipient account email</label>
        <input id="transfer-email" type="email" className="form-control mt-1.5" value={transferEmail}
          placeholder="buyer@example.com" autoComplete="off"
          onChange={(e) => setTransferEmail(e.target.value)} />
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" className="button-secondary" onClick={() => setTransferFor(null)}>Cancel</button>
          <button type="button" className="button-primary"
            disabled={busy !== null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(transferEmail.trim())}
            onClick={() => {
              if (transferFor) void act({ action: "project.transfer", projectId: transferFor.id, email: transferEmail.trim(), confirm: true }, `transfer-${transferFor.id}`);
              setTransferFor(null);
            }}>
            Transfer project
          </button>
        </div>
      </Dialog>
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
  const [publishOpen, setPublishOpen] = useState(false);
  return (
    <SectionShell title="Legal pages" note="Drafts never affect the public site until published. Publishing keeps revision history.">
      <div className="form-panel mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="legal-slug" className="form-label">Page</label>
            <BrandSelect id="legal-slug" className="mt-1.5" value={legalSlug}
              onChange={(v) => {
                const next = rows.find((l) => l.slug === v);
                setLegalSlug(v);
                setLegalTitle(next?.title ?? "");
                setLegalBody(next?.draftBody ?? "");
              }}
              options={rows.map((l) => ({ value: l.slug, label: `${l.slug} ${l.published ? "(published)" : "(not published)"}` }))} />
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
            onClick={() => setPublishOpen(true)}>
            Publish
          </button>
        </div>
        {legal && <p className="form-hint mt-3">{legal.published ? <>Published <LocalDateTime value={legal.publishedAt ?? ""} /> · {legal.revisions} revision(s) kept.</> : "Not published yet — the built-in default (refund) or existing page is shown."}</p>}
      </div>
      <ConfirmDialog
        open={publishOpen}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => { void act({ action: "legal.publish", slug: legalSlug, confirm: true }, "legal-publish"); setPublishOpen(false); }}
        title={`Publish the ${legalSlug} page?`}
        message="The draft becomes the public page immediately. The current public version is kept in revision history."
        confirmLabel="Publish now"
      />
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

interface ChangelogRow { id: string; title: string; body: string; tag: string; version: string | null; status: string; publishedAt: string | null; updatedAt: string; updatedBy: string | null }

const CHANGELOG_TAG_OPTIONS: [string, string][] = [
  ["feature", "New feature"],
  ["improvement", "Improvement"],
  ["fix", "Fix"],
  ["announcement", "Announcement"],
];

export function AdminChangelog({ entries }: { entries: ChangelogRow[] }) {
  const { busy, act } = useAdminActions();
  const paged = usePaged(entries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChangelogRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("feature");
  const [version, setVersion] = useState("");

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setTag("feature");
    setVersion("");
  }
  function startEdit(entry: ChangelogRow) {
    setEditingId(entry.id);
    setTitle(entry.title);
    setBody(entry.body);
    setTag(entry.tag);
    setVersion(entry.version ?? "");
  }

  return (
    <SectionShell title="Changelog — What's new" note="Only published entries appear on the public /changelog page. Drafts stay hidden; every change is recorded in the audit log.">
      <div className="form-panel mt-4">
        <h3 className="text-sm font-bold">{editingId ? "Edit entry" : "New entry"}</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="changelog-title" className="form-label">Title</label>
            <input id="changelog-title" className="form-control mt-1.5" value={title} maxLength={160}
              placeholder="e.g. Five new developer tools (Beta)" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor="changelog-tag" className="form-label">Type</label>
            <BrandSelect id="changelog-tag" className="mt-1.5" value={tag} onChange={setTag}
              options={CHANGELOG_TAG_OPTIONS.map(([value, label]) => ({ value, label }))} />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="changelog-version" className="form-label">Version label (optional)</label>
          <input id="changelog-version" className="form-control mt-1.5 max-w-xs" value={version} maxLength={40}
            placeholder="e.g. v1.4" onChange={(e) => setVersion(e.target.value)} />
        </div>
        <label htmlFor="changelog-body" className="form-label mt-4 block">What changed (plain text — blank line starts a new paragraph)</label>
        <textarea id="changelog-body" className="form-control mt-1.5 min-h-40" value={body}
          placeholder="Describe what shipped, honestly and in plain language." onChange={(e) => setBody(e.target.value)} />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy !== null} className="button-primary"
            onClick={() => void act(
              editingId
                ? { action: "changelog.update", id: editingId, title, body, tag, version }
                : { action: "changelog.create", title, body, tag, version },
              "changelog-save",
            ).then(resetForm)}>
            {busy === "changelog-save" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null}
            {editingId ? "Save changes" : "Create draft"}
          </button>
          {editingId && (
            <button type="button" disabled={busy !== null} className="button-secondary" onClick={resetForm}>
              Cancel editing
            </button>
          )}
        </div>
        <p className="form-hint mt-3">New entries start as drafts — review, then publish when ready.</p>
      </div>

      <ul className="mt-5 space-y-2">
        {paged.pageItems.map((entry) => (
          <li key={entry.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm">{entry.title}</span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-deep">
                {CHANGELOG_TAG_OPTIONS.find(([v]) => v === entry.tag)?.[1] ?? entry.tag}
              </span>
              {entry.version && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{entry.version}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${entry.status === "published" ? "bg-accent text-white" : "border border-line text-ink-mute"}`}>
                {entry.status === "published" ? "Published" : "Draft"}
              </span>
              <span className="ml-auto text-xs text-ink-mute">
                {entry.status === "published" && entry.publishedAt
                  ? <>Published <LocalDateTime value={entry.publishedAt} /></>
                  : <>Updated <LocalDateTime value={entry.updatedAt} /></>}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{entry.body}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                onClick={() => startEdit(entry)}>
                Edit
              </button>
              {entry.status === "published" ? (
                <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                  onClick={() => void act({ action: "changelog.setStatus", id: entry.id, publish: false }, `changelog-unpublish-${entry.id}`)}>
                  Unpublish
                </button>
              ) : (
                <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                  onClick={() => void act({ action: "changelog.setStatus", id: entry.id, publish: true }, `changelog-publish-${entry.id}`)}>
                  Publish
                </button>
              )}
              <button type="button" disabled={busy !== null} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                onClick={() => setDeleteTarget(entry)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-sm text-ink-mute">No changelog entries yet — create the first draft above.</li>
        )}
      </ul>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void act({ action: "changelog.delete", id: deleteTarget.id, confirm: true }, `changelog-delete-${deleteTarget.id}`);
          setDeleteTarget(null);
        }}
        title="Delete this changelog entry?"
        message={`Delete “${deleteTarget?.title ?? "this entry"}” permanently? This cannot be undone.`}
        confirmLabel="Delete entry"
        destructive
      />
    </SectionShell>
  );
}

interface DispatchRunRow { id: string; trigger: string; status: string; summary: unknown; error: string | null; durationMs: number | null; createdAt: string }
interface CustomerRunRow { id: string; jobName: string; url: string; method: string; ok: boolean; statusCode: number | null; error: string | null; at: string }

const TRIGGER_LABEL: Record<string, string> = {
  "vercel-cron": "Vercel Cron",
  "cron-job.org": "cron-job.org",
  "manual-admin": "Manual (admin)",
  activity: "Activity-driven",
  external: "External scheduler",
  "public-tick": "Public tick (no secret)",
};

/** Small copy-to-clipboard control used by the endpoint reference. */
function CopyUrl({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="button-secondary !min-h-8 shrink-0 !px-2.5 !py-1 text-xs"
      onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Fires a real GET at one of the public cron URLs from the admin's browser
 * and shows the raw answer, so "does it work?" never needs a terminal.
 */
function TryEndpoint({ path, label }: { path: string; label: string }) {
  const [state, setState] = useState<{ busy: boolean; result: string | null }>({ busy: false, result: null });
  async function run() {
    setState({ busy: true, result: null });
    try {
      const res = await fetch(path, { cache: "no-store" });
      const text = (await res.text()).slice(0, 220);
      setState({ busy: false, result: `HTTP ${res.status} · ${text}` });
    } catch {
      setState({ busy: false, result: "Request failed before reaching the server (network)." });
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="button-secondary !min-h-8 !px-2.5 !py-1 text-xs" disabled={state.busy} onClick={() => void run()}>
        {state.busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : null} {label}
      </button>
      {state.result && <code className="break-all text-[11px] text-ink-mute">{state.result}</code>}
    </span>
  );
}

interface CronEndpointInfo {
  name: string;
  path: string;
  method: "GET" | "POST";
  purpose: string;
  auth: string;
  caller: string;
  healthy: string;
  tryLabel?: string;
}

const CRON_ENDPOINTS: CronEndpointInfo[] = [
  {
    name: "Health",
    path: "/api/cron/health",
    method: "GET",
    purpose: "A thermometer: answers “is the site up?” and does no work at all. Without a secret it only says ok. With Authorization: Bearer CRON_SECRET it also makes one small bounded database read and reports queue depth — that is the “database ping”. It never advances scans, never sends email, and does not keep Neon awake.",
    auth: "None for liveness · Bearer CRON_SECRET for the database diagnostics (optional)",
    caller: "Uptime monitor / cron-job.org every 15 min with failure alerts on",
    healthy: "HTTP 200 {\"status\":\"ok\"}; 503 = database unreachable",
    tryLabel: "Ping health",
  },
  {
    name: "Tick",
    path: "/api/cron/tick",
    method: "GET",
    purpose: "A doorbell: tells Clyvro “do your pending work now” with NO secret. Safe to be public because it can only run the same bounded dispatcher pass as Dispatch, at most once every 5 minutes platform-wide no matter how often it is called (atomic database claim), and it returns no data. Use this from cron-job.org — nothing to paste into their dashboard.",
    auth: "None (by design) · per-address flood limit · one real run per 5 minutes",
    caller: "cron-job.org every 10 min — no header",
    healthy: "HTTP 200 with ran:true (a pass started) or ran:false reason:cooldown (nothing to do yet). Both are success.",
    tryLabel: "Send a tick",
  },
  {
    name: "Dispatch",
    path: "/api/cron/dispatch",
    method: "GET",
    purpose: "The worker itself, behind a key: the same pass as Tick but with no cooldown. Vercel Cron calls it daily and adds the Authorization: Bearer CRON_SECRET header by itself from the environment variable — that is why Vercel never asked you for a header. “Run dispatcher now” below is the same pass started from your admin session.",
    auth: "Required: Authorization: Bearer CRON_SECRET (401 without it)",
    caller: "Vercel Cron daily at 03:00 UTC (vercel.json) · admins · any scheduler that can send the header",
    healthy: "HTTP 200 with schedulesEnqueued/schedulesPaused counts",
  },
];

/** One dispatcher pass, in order — shown so the admin knows what “work” means. */
const PASS_STEPS = [
  "Queue scan schedules that are due",
  "Plan housekeeping (expired plans, owner life-grant)",
  "Run customers’ due cron jobs (their URLs, SSRF-guarded)",
  "Time out stuck scan jobs",
  "Process queued scan slices (up to ~4 minutes)",
  "Send up to 30 queued emails from the outbox",
];

export function AdminCron({ runs, customerRuns, siteUrl, cronSecretConfigured }: {
  runs: DispatchRunRow[];
  customerRuns: CustomerRunRow[];
  siteUrl: string;
  cronSecretConfigured: boolean;
}) {
  const { busy, act } = useAdminActions();
  const paged = usePaged(runs);
  const pagedCustomer = usePaged(customerRuns);
  const base = siteUrl.replace(/\/+$/, "");
  return (
    <div className="space-y-10">
      <SectionShell title="Endpoints & schedulers — what each one does"
        note="Three URLs, three different jobs. Only Dispatch needs the secret, and Vercel supplies that one by itself. Everything you might paste into an outside dashboard is listed here in full.">
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wide ${cronSecretConfigured ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
            CRON_SECRET {cronSecretConfigured ? "set in this deployment" : "missing — Dispatch answers 503"}
          </span>
          <span className="rounded-full bg-canvas px-2 py-0.5 font-semibold text-ink-mute">Vercel Cron: daily 03:00 UTC → Dispatch (vercel.json)</span>
          <span className="rounded-full bg-canvas px-2 py-0.5 font-semibold text-ink-mute">Site URL: {base}</span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {CRON_ENDPOINTS.map((e) => {
            const url = `${base}${e.path}`;
            return (
              <article key={e.path} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{e.name}</h3>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{e.method}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-[11px]" title={url}>{url}</code>
                  <CopyUrl value={url} />
                </div>
                <p className="text-xs text-ink-mute">{e.purpose}</p>
                <dl className="space-y-1 text-xs">
                  <div><dt className="inline font-semibold">Auth: </dt><dd className="inline text-ink-mute">{e.auth}</dd></div>
                  <div><dt className="inline font-semibold">Who calls it: </dt><dd className="inline text-ink-mute">{e.caller}</dd></div>
                  <div><dt className="inline font-semibold">Healthy reply: </dt><dd className="inline text-ink-mute">{e.healthy}</dd></div>
                </dl>
                {e.tryLabel ? <div className="mt-auto pt-1"><TryEndpoint path={e.path} label={e.tryLabel} /></div> : (
                  <p className="mt-auto pt-1 text-[11px] text-ink-mute">Test it with “Run dispatcher now” below (same pass, admin session).</p>
                )}
              </article>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="text-sm font-bold">Recommended cron-job.org setup (no secret anywhere)</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-mute">
              <li>Job 1 — <code>GET {base}/api/cron/tick</code>, every 10 minutes, no headers. Expect HTTP 200.</li>
              <li>Job 2 — <code>GET {base}/api/cron/health</code>, every 15 minutes, no headers, failure notifications on. Expect HTTP 200; a 503 means the database is unreachable.</li>
              <li>Leave <code>/api/cron/dispatch</code> to Vercel Cron. Only use it elsewhere if that scheduler can send <code>Authorization: Bearer CRON_SECRET</code>.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="text-sm font-bold">What one dispatcher pass does, in order</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-mute">
              {PASS_STEPS.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <p className="mt-2 text-[11px] text-ink-mute">Customer cron jobs (the URLs users ask Clyvro to call from <code>/app/cron</code>) run inside step 3 — there is no separate endpoint to configure for them.</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <h3 className="text-sm font-bold">Other inbound URLs (webhooks — not cron, but the ones third-party dashboards ask for)</h3>
          <ul className="mt-2 space-y-2 text-xs">
            <li className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Flutterwave webhook</span>
              <code className="break-all font-mono text-[11px]">POST {base}/api/billing/webhook</code>
              <CopyUrl value={`${base}/api/billing/webhook`} />
              <span className="text-ink-mute">Flutterwave Dashboard → Settings → Webhooks; the “secret hash” there must equal <code>FLUTTERWAVE_WEBHOOK_SECRET</code> in Vercel.</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">GitHub App webhook</span>
              <code className="break-all font-mono text-[11px]">POST {base}/api/github/webhook</code>
              <CopyUrl value={`${base}/api/github/webhook`} />
              <span className="text-ink-mute">GitHub → Settings → Developer settings → GitHub Apps → Webhook URL; its secret must equal <code>GITHUB_APP_WEBHOOK_SECRET</code>.</span>
            </li>
          </ul>
        </div>
      </SectionShell>

      <SectionShell title="Website dispatcher (main cron)"
        note="Runs our scan jobs, due schedules, plan housekeeping and the email outbox. Started daily by Vercel Cron (vercel.json), by public ticks from outside schedulers, by the button below, and opportunistically on dashboard activity. Every run is recorded in the database (Neon in production).">
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy !== null} className="button-primary"
            onClick={() => void act({ action: "cron.runNow" }, "cron-run")}>
            {busy === "cron-run" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Run dispatcher now
          </button>
          <span className="text-xs text-ink-mute">Same pass as <code>/api/cron/dispatch</code> and <code>/api/cron/tick</code>. Last {runs.length} run(s) below.</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Trigger</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Detail</th>
            </tr></thead>
            <tbody>
              {paged.pageItems.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-xs"><LocalDateTime value={r.createdAt} /></td>
                  <td className="px-4 py-3 text-xs font-semibold">{TRIGGER_LABEL[r.trigger] ?? r.trigger}</td>
                  <td className="px-4 py-3">{r.status === "completed"
                    ? <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">Completed</span>
                    : <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-bad">Failed</span>}</td>
                  <td className="px-4 py-3 text-xs">{r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-ink-mute">{r.error ?? (r.summary ? JSON.stringify(r.summary).slice(0, 140) : "—")}</td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-sm text-ink-mute">No dispatcher runs recorded yet — press “Run dispatcher now” or wait for the next scheduled run.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
      </SectionShell>

      <SectionShell title="Customer cron jobs (in-app)"
        note="Recent executions of the cron jobs users create inside their workspaces — separate from the website dispatcher above.">
        <ul className="mt-3 space-y-2">
          {pagedCustomer.pageItems.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${r.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{r.ok ? "OK" : "Failed"}</span>
              <span className="font-semibold">{r.jobName}</span>
              <span className="max-w-72 truncate text-xs text-ink-mute" title={r.url}>{r.method} {r.url}</span>
              <span className="text-xs text-ink-mute">{r.statusCode ? `HTTP ${r.statusCode}` : r.error ?? ""}</span>
              <span className="ml-auto text-xs text-ink-mute"><LocalDateTime value={r.at} /></span>
            </li>
          ))}
          {customerRuns.length === 0 && <li className="text-sm text-ink-mute">No customer cron job runs yet.</li>}
        </ul>
        <Pagination page={pagedCustomer.page} totalPages={pagedCustomer.totalPages} total={pagedCustomer.total} onPage={pagedCustomer.setPage} />
      </SectionShell>
    </div>
  );
}

export function AdminMaintenance({ maintenance }: { maintenance: { enabled: boolean; message: string; eta: string | null; reason?: string } }) {
  const { busy, act } = useAdminActions();
  const [enabled, setEnabled] = useState(maintenance.enabled);
  const [message, setMessage] = useState(maintenance.message);
  const [eta, setEta] = useState(maintenance.eta ? maintenance.eta.slice(0, 16) : "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <SectionShell title="Maintenance mode"
      note="When ON, public pages redirect to /maintenance. Admin, API routes, sign-in and the maintenance page itself stay reachable. Shield also turns this on automatically during a heavy flood (breach-attack notice). Changes apply within ~20 seconds and are audit-logged.">
      <div className="form-panel mt-4 space-y-4">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[#2563EB]" />
          Maintenance mode {enabled ? "ON" : "OFF"}
        </label>
        <div>
          <label htmlFor="mnt-message" className="form-label">Message shown to visitors</label>
          <textarea id="mnt-message" className="form-control mt-1.5 min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
        </div>
        <div>
          <label htmlFor="mnt-eta" className="form-label">Expected back (optional)</label>
          <input id="mnt-eta" type="datetime-local" className="form-control mt-1.5" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy !== null} className="button-primary"
            onClick={() => {
              if (enabled) { setConfirmOpen(true); return; }
              void act({ action: "maintenance.set", enabled, message, eta: eta ? new Date(eta).toISOString() : null }, "maintenance");
            }}>
            {busy === "maintenance" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Save maintenance settings
          </button>
          <Link href="/maintenance" className="button-secondary">Preview /maintenance</Link>
        </div>
        {maintenance.enabled
          ? <p className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold ${maintenance.reason === "attack" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
              {maintenance.reason === "attack"
                ? "Maintenance is ON because Shield detected a heavy flood (emergency override). Public visitors see a breach-attack notice."
                : "Maintenance is currently ON for the public site."}
            </p>
          : <p className="text-xs text-ink-mute">Maintenance is currently off — the public site is fully open.</p>}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          void act({ action: "maintenance.set", enabled, message, eta: eta ? new Date(eta).toISOString() : null }, "maintenance");
          setConfirmOpen(false);
        }}
        title="Turn maintenance mode ON?"
        message="Public pages will redirect to /maintenance. Admin, API routes, sign-in and the maintenance page itself stay reachable."
        confirmLabel="Turn it on"
      />
    </SectionShell>
  );
}
