"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import LocalDateTime from "@/components/LocalDateTime";

interface AdminUser { id: string; email: string; name: string | null; isPlatformAdmin: boolean; suspended: boolean; createdAt: string; workspaces: { name: string; role: string }[] }
interface AdminOrg { id: string; name: string; planId: string; planExpiresAt: string | null; adminPlanId: string | null; adminPlanNote: string | null; members: number; scansUsed: number; lastPayment: { status: string; planId: string; at: string } | null }
interface AdminJob { jobId: string; auditId: string; jobStatus: string; auditStatus: string; scanMode: string; targetUrl: string; attempts: number; failureCount: number; lastError: string | null; updatedAt: string }
interface AdminLogRow { id: string; actorEmail: string; action: string; targetType: string | null; targetId: string | null; createdAt: string }
interface LegalRow { slug: string; title: string; draftBody: string; published: boolean; publishedAt: string | null; revisions: number }

export interface AdminData { users: AdminUser[]; orgs: AdminOrg[]; jobs: AdminJob[]; log: AdminLogRow[]; legal: LegalRow[] }

const PLAN_OPTIONS = ["", "freemium", "basic", "pro", "ultra-agency"];

export default function AdminConsole({ data }: { data: AdminData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [legalSlug, setLegalSlug] = useState(data.legal[0]?.slug ?? "refund");
  const legal = data.legal.find((l) => l.slug === legalSlug) ?? data.legal[0];
  const [legalTitle, setLegalTitle] = useState(legal?.title ?? "");
  const [legalBody, setLegalBody] = useState(legal?.draftBody ?? "");

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

  return (
    <div className="space-y-10">
      <section aria-label="Users">
        <h2 className="text-lg font-bold">Users</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">User</th><th className="px-4 py-3">Workspaces</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {data.users.map((u) => (
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
      </section>

      <section aria-label="Organizations">
        <h2 className="text-lg font-bold">Workspaces & plans</h2>
        <p className="mt-1 text-sm text-ink-mute">Purchased plan and administrator override are separate. An override is always labelled and logged.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Purchased</th><th className="px-4 py-3">Admin override</th><th className="px-4 py-3">Usage</th>
            </tr></thead>
            <tbody>
              {data.orgs.map((o) => (
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
      </section>

      <section aria-label="Jobs">
        <h2 className="text-lg font-bold">Scan jobs</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">Target</th><th className="px-4 py-3">Job / audit</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Action</th>
            </tr></thead>
            <tbody>
              {data.jobs.map((j) => (
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
      </section>

      <section aria-label="Legal pages">
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} className="text-accent" aria-hidden /> Legal pages</h2>
        <p className="mt-1 text-sm text-ink-mute">Drafts never affect the public site until published. Publishing keeps revision history.</p>
        <div className="form-panel mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="legal-slug" className="form-label">Page</label>
              <select id="legal-slug" className="form-control mt-1.5" value={legalSlug}
                onChange={(e) => {
                  const next = data.legal.find((l) => l.slug === e.target.value);
                  setLegalSlug(e.target.value);
                  setLegalTitle(next?.title ?? "");
                  setLegalBody(next?.draftBody ?? "");
                }}>
                {data.legal.map((l) => <option key={l.slug} value={l.slug}>{l.slug} {l.published ? "(published)" : "(not published)"}</option>)}
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
      </section>

      <section aria-label="Admin audit log">
        <h2 className="text-lg font-bold">Admin audit log</h2>
        <ul className="mt-3 space-y-2">
          {data.log.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="font-semibold">{r.action}</span>
              <span className="text-ink-mute">{r.actorEmail}</span>
              {r.targetType && <span className="text-xs text-ink-mute">{r.targetType}: {r.targetId}</span>}
              <span className="ml-auto text-xs text-ink-mute"><LocalDateTime value={r.createdAt} /></span>
            </li>
          ))}
          {data.log.length === 0 && <li className="text-sm text-ink-mute">No admin actions recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
