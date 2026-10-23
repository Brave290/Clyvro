"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import LocalDateTime from "@/components/LocalDateTime";
import { CodeBlock, CopyButton } from "@/components/CopyCode";
import { SITE_API_SNIPPETS, siteApiQuickStart } from "@/lib/site-api-docs";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  kind?: string;
  origins?: string | null;
}

export default function OrgApiKeys({ planId, canManage }: { planId: string; canManage: boolean }) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
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
  const activeCount = keys?.filter((k) => !k.revokedAt).length ?? 0;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || busy || !name.trim()) return;
    setBusy(true);
    setSecret(null);
    try {
      const res = await fetch("/api/org/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind: origins.trim() ? "site" : "secret", origins: origins.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't create a key.");
      setSecret(json.secret as string);
      setName("");
      setOrigins("");
      toast("success", "API key created", "Copy it now — we only show the secret once.");
      await load();
    } catch (err) {
      toast("error", "Key not created", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, label: string) {
    if (!canManage) return;
    if (!window.confirm(`Revoke “${label}”? Requests with that secret will stop working.`)) return;
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
    toast("success", "Secret copied");
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Active keys</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{allowed ? `${activeCount} / 5` : "—"}</p>
          <p className="mt-0.5 text-xs text-ink-mute">Five secrets + three site keys.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Who can use it</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">Pro · Agency</p>
          <p className="mt-0.5 text-xs text-ink-mute">Unlimited Full Scan + Site Guard.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">How to send it</p>
          <p className="mt-1 font-mono text-sm font-semibold">Bearer cly_…</p>
          <p className="mt-0.5 text-xs text-ink-mute">Authorization header on every call.</p>
        </div>
      </div>

      {!allowed || gate ? (
        <div className="rounded-2xl border border-warn/25 bg-warn-soft px-5 py-5">
          <p className="font-semibold">{gate ?? "Upgrade to Pro or Agency to create API keys."}</p>
          <p className="mt-1 text-sm text-ink-soft">The Site API is not on Free or Starter. Other tools stay open so you can try them first.</p>
          <Link href="/pricing" className="button-primary mt-4 inline-flex">See plans</Link>
        </div>
      ) : !canManage ? (
        <div className="rounded-2xl border border-warn/25 bg-warn-soft px-5 py-5">
          <p className="font-semibold">Only owners and admins can create or revoke API keys.</p>
          <p className="mt-1 text-sm text-ink-soft">Ask a workspace admin if you need a key for CI or Site Guard.</p>
        </div>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-bold">Create a key</h2>
          <p className="mt-1 text-sm text-ink-mute">Name it after where it will live. Leave hostnames empty for a secret key. Add hostnames for a Shield widget site key.</p>
          <form className="mt-5 flex flex-col gap-3" onSubmit={create} autoComplete="off">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="form-label">Key label</span>
              <input
                id="clyvro-api-key-label"
                name="clyvro-api-key-label"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. CI pipeline"
                className="form-control mt-1.5"
              />
            </label>
            <button type="submit" disabled={busy || !name.trim()} className="button-primary sm:min-w-36">
              {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <KeyRound size={15} aria-hidden />}
              Create key
            </button>
            </div>
            <label className="block">
              <span className="form-label">Hostnames for a site key (optional)</span>
              <input value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="example.com, www.example.com"
                className="form-control mt-1.5" autoComplete="off" />
            </label>
          </form>
        </section>
      )}

      {secret && (
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/50 px-5 py-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-deep">
            <ShieldCheck size={14} aria-hidden /> Copy this secret now — it will not be shown again
          </p>
          <p className="mt-3 break-all font-mono text-sm leading-relaxed">{secret}</p>
          <button type="button" onClick={() => void copySecret()} className="button-secondary mt-4">
            <Copy size={14} aria-hidden /> Copy secret
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">Your keys</h2>
        {keys === null ? (
          <p className="mt-3 text-sm text-ink-mute">Loading keys…</p>
        ) : keys.length === 0 ? (
          <p className="mt-3 text-sm text-ink-mute">No keys yet. Create one above when you are on Pro or Agency.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{k.name}{k.kind === "site" ? " · site key" : ""}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-mute">{k.prefix}…{k.origins ? ` · ${k.origins}` : ""}</p>
                </div>
                <p className="text-xs text-ink-mute">
                  Created <LocalDateTime value={k.createdAt} format="date" />
                </p>
                <p className="text-xs text-ink-mute">
                  {k.lastUsedAt ? <>Last used <LocalDateTime value={k.lastUsedAt} format="date" /></> : "Never used"}
                </p>
                {k.revokedAt ? (
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">Revoked</span>
                ) : canManage && allowed ? (
                  <button
                    type="button"
                    onClick={() => void revoke(k.id, k.name)}
                    className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-bad hover:underline"
                  >
                    <Trash2 size={12} aria-hidden /> Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Quick start</h2>
            <p className="mt-1 text-sm text-ink-mute">Replace <code className="font-mono text-ink">cly_YOUR_KEY</code> with the secret you just copied.</p>
          </div>
          <CopyButton text={siteApiQuickStart()} label="Copy all" copiedLabel="Copied all" />
        </div>
        <div className="mt-5 space-y-4">
          <CodeBlock caption="Site Guard — inspect one request" code={SITE_API_SNIPPETS.guardCurl} />
          <CodeBlock caption="Full Scan — queue a run" code={SITE_API_SNIPPETS.scanCreate} />
          <CodeBlock caption="Full Scan — poll until done" code={SITE_API_SNIPPETS.scanPoll} />
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          Full reference, Node and Python:{" "}
          <Link href="/docs/api" className="font-semibold text-accent hover:underline">/docs/api</Link>.
        </p>
      </section>
    </div>
  );
}
