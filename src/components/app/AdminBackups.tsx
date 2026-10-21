"use client";
import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Download, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";

interface Backup {
  id: string; scope: string; label: string; sizeBytes: number;
  manifest: Record<string, number>; organizationId: string | null; createdAt: string;
}
interface Preview {
  backupId: string; scope: string; exportedAt: string;
  workspaces: { organizationId: string; organizationName: string; exists: boolean; counts: Record<string, number> }[];
  notes: string[];
}

const TABLE_LABELS: Record<string, string> = {
  clients: "Clients", projects: "Websites", audits: "Scans", auditPages: "Scanned pages",
  findings: "Findings", scanSchedules: "Schedules", cronJobs: "Cron jobs", cronJobRuns: "Cron runs",
  readinessChecks: "Readiness checks", aiPatternChecks: "AI-pattern checks", workspaces: "Workspaces",
};

/**
 * Admin → Backup & Restore. Whole-website backups to Cloudflare R2
 * and restore from them — platform-admin only (it covers every
 * workspace, so it deliberately does not live on the user side).
 * One Backup button, one Restore flow with a dry-run preview:
 * restores insert fresh copies and never overwrite.
 */
export default function AdminBackups() {
  const { toast } = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBackup, setPreviewBackup] = useState<Backup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/backups");
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setConfigured(Boolean(json.configured));
      setBackups((json.backups as Backup[]).filter((b) => b.scope === "platform"));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createBackupNow() {
    setBusy("create");
    try {
      const res = await fetch("/api/backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "platform" }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Backup failed.");
      toast("success", "Website backed up", "The full-website archive is in Cloudflare R2.");
      await load();
    } catch (err) {
      toast("error", "Backup failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function download(b: Backup) {
    setBusy(`download-${b.id}`);
    try {
      const res = await fetch(`/api/backups/${b.id}/download`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error?.message ?? "Couldn't create the download link.");
      window.open(json.url as string, "_blank", "noopener");
    } catch (err) {
      toast("error", "Download failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openPreview(b: Backup) {
    setBusy(`preview-${b.id}`);
    try {
      const res = await fetch(`/api/backups/${b.id}/restore-preview`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't read that backup.");
      setPreview(json.preview as Preview);
      setPreviewBackup(b);
    } catch (err) {
      toast("error", "Preview failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function applyRestore() {
    if (!previewBackup) return;
    setBusy("restore");
    try {
      const res = await fetch(`/api/backups/${previewBackup.id}/restore-platform`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Restore failed.");
      const restored = (json.restoredWorkspaces as { workspace: string }[]).length;
      const skipped = (json.skippedWorkspaces as string[]).length;
      toast("success", "Restore complete", `${restored} workspace(s) restored as fresh copies${skipped ? `; ${skipped} skipped (no longer exist)` : ""}.`);
      setPreview(null);
      setPreviewBackup(null);
    } catch (err) {
      toast("error", "Restore failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function applyDelete() {
    if (!deleteTarget) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/backups/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Delete failed.");
      toast("success", "Backup deleted", "The archive was removed from R2.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast("error", "Delete failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const size = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : n > 1000 ? `${(n / 1000).toFixed(1)} KB` : `${n} B`);
  const restorableCount = preview?.workspaces.filter((w) => w.exists).length ?? 0;

  return (
    <section aria-label="Backup and restore">
      <h2 className="text-lg font-bold">Backup &amp; Restore</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Whole-website backups to Cloudflare R2 — every workspace&apos;s clients, websites, scans with full reports,
        schedules, cron jobs, Readiness and AI-pattern checks — and restore from any of them. Restores always preview
        first and insert fresh copies; they never overwrite. Admin-only, because a restore touches every workspace.
      </p>

      {configured === false && (
        <div className="mt-5 rounded-2xl border border-warn/40 bg-warn-soft/50 p-5" role="status">
          <h3 className="font-semibold">Cloudflare R2 isn&apos;t configured yet</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Backup &amp; Restore stays honestly switched off until the server has R2 credentials. Add these
            environment variables (server-side only), then reload:
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-ink-soft">
            <li>R2_ACCOUNT_ID (or R2_ENDPOINT)</li>
            <li>R2_ACCESS_KEY_ID</li>
            <li>R2_SECRET_ACCESS_KEY</li>
            <li>R2_BUCKET</li>
          </ul>
        </div>
      )}

      <div className="form-panel mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-semibold">Back up the whole website</p>
          <p className="mt-1 text-sm text-ink-soft">One versioned JSON archive of every workspace, stored in R2. Token hashes, payments and usage counters are never included.</p>
        </div>
        <button type="button" disabled={!configured || busy !== null} onClick={() => void createBackupNow()} className="button-primary">
          {busy === "create" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <CloudUpload size={15} aria-hidden />}
          Back up now
        </button>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold">Stored backups</h3>
        {backups.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-mute">
            No website backups yet. Create the first one above — it takes a few seconds.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {backups.map((b) => (
              <li key={b.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" title={b.label}>{b.label}</span>
                    <span className="block text-xs text-ink-mute">
                      <LocalDateTime value={b.createdAt} /> · {size(b.sizeBytes)}
                      {" · "}{Object.entries(b.manifest).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${TABLE_LABELS[k] ?? k}`).join(" · ") || "empty"}
                    </span>
                  </span>
                  <button type="button" disabled={busy !== null} onClick={() => void download(b)} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs">
                    {busy === `download-${b.id}` ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />} Download
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void openPreview(b)} className="button-primary !min-h-9 !px-3 !py-1.5 text-xs">
                    {busy === `preview-${b.id}` ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <RotateCcw size={13} aria-hidden />} Restore…
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => setDeleteTarget(b)} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs">
                    <Trash2 size={13} aria-hidden /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={preview !== null} onClose={() => { setPreview(null); setPreviewBackup(null); }} title="Restore preview — nothing written yet" eyebrow="Backup & Restore">
        {preview && (
          <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
            <p>
              Backup from <LocalDateTime value={preview.exportedAt} />. Restoring brings back{" "}
              <strong className="text-ink">{restorableCount} of {preview.workspaces.length} workspace(s)</strong> as fresh
              copies inside their own workspaces. Workspaces that no longer exist are skipped and reported.
            </p>
            <ul className="space-y-2">
              {preview.workspaces.map((w) => (
                <li key={w.organizationId} className="rounded-xl bg-canvas px-3 py-2">
                  <span className="flex items-center justify-between gap-3">
                    <strong className="text-ink">{w.organizationName}</strong>
                    {w.exists
                      ? <span className="text-xs font-semibold text-good">Will restore</span>
                      : <span className="text-xs font-semibold text-warn">No longer exists — skipped</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-mute">
                    {Object.entries(w.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${TABLE_LABELS[k] ?? k}`).join(" · ") || "nothing stored"}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1.5 text-xs text-ink-mute">
              {preview.notes.map((n) => <li key={n}>• {n}</li>)}
            </ul>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className="button-secondary" onClick={() => { setPreview(null); setPreviewBackup(null); }}>Cancel</button>
              <button type="button" disabled={restorableCount === 0 || busy !== null} onClick={() => void applyRestore()} className="button-primary">
                {busy === "restore" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RotateCcw size={15} aria-hidden />}
                Restore {restorableCount} workspace{restorableCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void applyDelete()}
        title="Delete this backup?"
        message={`“${deleteTarget?.label ?? "Backup"}” will be removed from Cloudflare R2 permanently. This can't be undone.`}
        confirmLabel="Delete backup"
        destructive
      />
    </section>
  );
}
