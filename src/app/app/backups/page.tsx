"use client";
import { useCallback, useEffect, useState } from "react";
import { CloudUpload, DatabaseBackup, Download, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";

interface Backup {
  id: string; scope: string; label: string; sizeBytes: number;
  manifest: Record<string, number>; organizationId: string | null; createdAt: string;
}
interface Preview {
  backupId: string; scope: string; exportedAt: string;
  workspaces: { organizationId: string; organizationName: string; restorableHere: boolean; counts: Record<string, number> }[];
  notes: string[];
}

const TABLE_LABELS: Record<string, string> = {
  clients: "Clients", projects: "Websites", audits: "Scans", auditPages: "Scanned pages",
  findings: "Findings", scanSchedules: "Schedules", cronJobs: "Cron jobs", cronJobRuns: "Cron runs",
  readinessChecks: "Readiness checks", aiPatternChecks: "AI-pattern checks", workspaces: "Workspaces",
};

export default function BackupsPage() {
  const { toast } = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
      setIsAdmin(Boolean(json.isPlatformAdmin));
      setBackups(json.backups as Backup[]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(scope: "workspace" | "platform") {
    setBusy(`create-${scope}`);
    try {
      const res = await fetch("/api/backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Backup failed.");
      toast("success", "Backup stored", "The archive is in your Cloudflare R2 bucket.");
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
      const res = await fetch(`/api/backups/${previewBackup.id}/restore`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Restore failed.");
      const total = Object.values(json.restored as Record<string, number>).reduce((n, v) => n + v, 0);
      toast("success", "Restore complete", `${total} records restored into this workspace as fresh copies.`);
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
  const mine = preview?.workspaces.find((w) => w.restorableHere);

  return (
    <div className="mt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Backups &amp; export</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Snapshot this workspace — clients, websites, scans with full reports, schedules, cron jobs, Readiness and
          AI-pattern checks — into your own Cloudflare R2 bucket, and restore it back as fresh copies whenever you need.
          Restores always preview first and never overwrite existing data.
        </p>
      </header>

      {configured === false && (
        <div className="mt-6 rounded-2xl border border-warn/40 bg-warn-soft/50 p-6" role="status">
          <h2 className="font-semibold">Cloudflare R2 isn&apos;t configured yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Backups stay honestly switched off until the server has R2 credentials. Add these environment variables
            (server-side only, never in the browser), then reload this page:
          </p>
          <ul className="mt-3 space-y-1 font-mono text-xs text-ink-soft">
            <li>R2_ACCOUNT_ID (or R2_ENDPOINT)</li>
            <li>R2_ACCESS_KEY_ID</li>
            <li>R2_SECRET_ACCESS_KEY</li>
            <li>R2_BUCKET</li>
          </ul>
        </div>
      )}

      <div className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-semibold">Create a backup</p>
          <p className="mt-1 text-sm text-ink-soft">Stored in R2 as one versioned JSON archive. Token hashes, payments and usage counters are never included.</p>
        </div>
        <button type="button" disabled={!configured || busy !== null} onClick={() => void create("workspace")} className="button-primary">
          {busy === "create-workspace" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <CloudUpload size={15} aria-hidden />}
          Back up this workspace
        </button>
        {isAdmin && (
          <button type="button" disabled={!configured || busy !== null} onClick={() => void create("platform")} className="button-secondary">
            {busy === "create-platform" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <DatabaseBackup size={15} aria-hidden />}
            Back up whole platform
          </button>
        )}
      </div>

      <section aria-label="Stored backups" className="mt-8">
        <h2 className="text-lg font-bold">Stored backups</h2>
        {backups.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-mute">
            No backups yet. Create the first one above — it takes a few seconds.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {backups.map((b) => (
              <li key={b.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" title={b.label}>{b.label}</span>
                    <span className="block text-xs text-ink-mute">
                      <LocalDateTime value={b.createdAt} /> · {size(b.sizeBytes)} · {b.scope === "platform" ? "Platform" : "Workspace"}
                      {" · "}{Object.entries(b.manifest).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${TABLE_LABELS[k] ?? k}`).join(" · ") || "empty"}
                    </span>
                  </span>
                  <button type="button" disabled={busy !== null} onClick={() => void download(b)} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs">
                    {busy === `download-${b.id}` ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />} Download
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void openPreview(b)} className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs">
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
      </section>

      <Dialog open={preview !== null} onClose={() => { setPreview(null); setPreviewBackup(null); }} title="Restore preview — nothing written yet" eyebrow="Backups & export">
        {preview && (
          <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
            <p>
              Backup from <LocalDateTime value={preview.exportedAt} /> ({preview.scope} scope).
              {mine
                ? <> Restoring into this workspace (<strong className="text-ink">{mine.organizationName}</strong>) would insert:</>
                : <> This backup doesn&apos;t contain the current workspace, so it can&apos;t be restored here — open the workspace it belongs to instead.</>}
            </p>
            {mine && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(mine.counts).map(([k, n]) => (
                  <li key={k} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2">
                    <span>{TABLE_LABELS[k] ?? k}</span><strong className="text-ink">{n}</strong>
                  </li>
                ))}
              </ul>
            )}
            <ul className="space-y-1.5 text-xs text-ink-mute">
              {preview.notes.map((n) => <li key={n}>• {n}</li>)}
            </ul>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className="button-secondary" onClick={() => { setPreview(null); setPreviewBackup(null); }}>Cancel</button>
              <button type="button" disabled={!mine || busy !== null} onClick={() => void applyRestore()} className="button-primary">
                {busy === "restore" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RotateCcw size={15} aria-hidden />}
                Restore as fresh copies
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
    </div>
  );
}
