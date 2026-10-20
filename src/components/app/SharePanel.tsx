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
    <section className="mt-8 rounded-2xl border border-line bg-surface p-6" aria-label="Share report">
      <h3 className="flex items-center gap-2 font-semibold"><Link2 size={17} className="text-accent" aria-hidden /> Share this report</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Creates a read-only public link (256-bit token, stored hashed) that expires after 30 days.
        Anyone with the link can view this report — revoke anytime.
      </p>
      {freshUrl && (
        <div className="mt-4 rounded-xl border border-good/25 bg-good-soft p-4" role="status">
          <p className="text-xs font-semibold text-good">Copy this link now — it&apos;s shown only once:</p>
          <p className="mt-1.5 break-all font-mono text-xs">{freshUrl}</p>
          <button
            onClick={() => void navigator.clipboard?.writeText(freshUrl).then(() => toast("success", "Link copied"))}
            className="mt-2 rounded-lg bg-good px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950"
          >
            Copy link
          </button>
        </div>
      )}
      <button onClick={() => void create()} disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover hover:shadow-md disabled:opacity-60">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
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
    </section>
  );
}
