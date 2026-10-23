"use client";
import { useCallback, useEffect, useState } from "react";
import { Link2, LoaderCircle, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/Dialog";
import LocalDateTime from "@/components/LocalDateTime";

interface ShareRow {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export default function SharePanel({ auditId }: { auditId: string }) {
  const { toast } = useToast();
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/audits/${auditId}/share`);
    if (res.ok) {
      const data = await res.json();
      setShares(data.shares ?? []);
    }
  }, [auditId]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/audits/${auditId}/share`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't create the link.");
      setFreshUrl(data.url);
      await load();
    } catch (err) {
      toast("error", "Share link failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    const res = await fetch(`/api/audits/${auditId}/share`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenId: revoking }),
    });
    setRevoking(null);
    if (res.ok) {
      toast("success", "Share link revoked", "Anyone with the old link can no longer open this report.");
      await load();
    } else {
      toast("error", "Couldn't revoke the link");
    }
  }

  const active = shares.filter((s) => !s.revokedAt);

  return (
    <details className="group mt-3 overflow-hidden rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Link2 size={15} className="text-accent" aria-hidden /> Share</span>
      </summary>
      <div className="border-t border-line px-3.5 py-3">
      <p className="text-[12px] text-ink-soft">Read-only link. Expires in 30 days. Revoke anytime.</p>
      {freshUrl && (
        <div className="mt-3 rounded-lg border border-good/25 bg-good-soft p-3" role="status">
          <p className="text-[11px] font-semibold text-good">Copy now — shown once:</p>
          <p className="mt-1 break-all font-mono text-[11px]">{freshUrl}</p>
          <button
            onClick={() => void navigator.clipboard?.writeText(freshUrl).then(() => toast("success", "Link copied"))}
            className="mt-2 rounded-md bg-good px-3 py-1 text-[11px] font-semibold text-white dark:text-slate-950"
          >
            Copy link
          </button>
        </div>
      )}
      <button onClick={() => void create()} disabled={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-60">
        {busy && <LoaderCircle size={14} className="animate-spin" aria-hidden />}
        Create share link
      </button>
      {active.length > 0 && (
        <ul className="mt-4 space-y-2">
          {active.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-4 py-3 text-xs text-ink-soft">
              <span>Active link · created <LocalDateTime value={s.createdAt} format="date" />
                {s.expiresAt && <> · expires <LocalDateTime value={s.expiresAt} format="date" /></>}</span>
              <button onClick={() => setRevoking(s.id)}
                className="ml-auto inline-flex items-center gap-1 font-semibold text-bad hover:underline">
                <Trash2 size={13} aria-hidden /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={revoking !== null}
        onCancel={() => setRevoking(null)}
        onConfirm={() => void revoke()}
        title="Revoke this share link?"
        message="Anyone holding this link will immediately lose access to the shared report. This can't be undone — you can create a new link later."
        confirmLabel="Revoke link"
        cancelLabel="Keep link"
        destructive
      />
      </div>
    </details>
  );
}
