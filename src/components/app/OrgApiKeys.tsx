"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function OrgApiKeys({ planId, canManage }: { planId: string; canManage: boolean }) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("Production");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/org/api-keys");
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      if (json?.error?.code === "PLAN_LIMIT") {
        setGate(json?.error?.message ?? "The Site API is on the Pro and Agency plans.");
      }
      setKeys([]);
      return;
    }
    setGate(null);
    setKeys((json.keys as KeyRow[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const allowed = planId === "pro" || planId === "ultra-agency";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    setSecret(null);
    try {
      const res = await fetch("/api/org/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't create a key.");
      setSecret(json.secret as string);
      toast("success", "API key created", "Copy it now — we only show the secret once.");
      await load();
    } catch (err) {
      toast("error", "Key not created", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!canManage) return;
    const res = await fetch(`/api/org/api-keys/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      toast("error", "Couldn't revoke", json?.error?.message);
      return;
    }
    toast("success", "Key revoked");
    await load();
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    toast("success", "Copied");
  }

  return (
    <section className="form-panel mt-8">
      <h2 className="flex items-center gap-2 font-semibold">
        <KeyRound size={16} aria-hidden /> Site API keys
      </h2>
      <p className="mt-1 text-sm text-ink-mute">
        Pro and Agency: unlimited Full Scan and Site Guard from your own code.
        Put the inspector in front of your site, or start a Full Scan with a Bearer token.
        Docs: <Link href="/docs/api" className="font-semibold text-accent hover:underline">/docs/api</Link>.
      </p>

      {!allowed || gate ? (
        <p className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm">
          {gate ?? "Upgrade to Pro or Ultra Agency to create API keys."}{" "}
          <Link href="/pricing" className="font-semibold text-accent hover:underline">See plans</Link>
        </p>
      ) : !canManage ? (
        <p className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm">
          Only owners and admins can create or revoke API keys.
        </p>
      ) : (
        <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={create}>
          <label className="block flex-1">
            <span className="form-label">Key name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="form-control mt-1.5" />
          </label>
          <button type="submit" disabled={busy} className="button-primary">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null}
            Create key
          </button>
        </form>
      )}

      {secret && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Copy this secret now</p>
          <p className="mt-1 break-all font-mono text-sm">{secret}</p>
          <button type="button" onClick={() => void copySecret()} className="button-secondary mt-3 !min-h-9">
            <Copy size={14} aria-hidden /> Copy secret
          </button>
        </div>
      )}

      {keys && keys.length > 0 && (
        <ul className="mt-5 space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas/60 px-4 py-3 text-sm">
              <span className="font-semibold">{k.name}</span>
              <span className="font-mono text-xs text-ink-mute">{k.prefix}…</span>
              {k.revokedAt ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Revoked</span>
              ) : canManage && allowed ? (
                <button type="button" onClick={() => void revoke(k.id)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-bad hover:underline">
                  <Trash2 size={12} aria-hidden /> Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
