"use client";
import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, MonitorSmartphone } from "lucide-react";

export default function CliDevicePage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: code }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        window.location.href = `/sign-in?callbackUrl=${encodeURIComponent("/cli/device")}`;
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not approve that code.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        <MonitorSmartphone size={14} aria-hidden /> Clyvro CLI
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Approve this device</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Type the code shown in your terminal. This signs the CLI into your workspace.
      </p>
      {done ? (
        <div className="mt-8 rounded-2xl border border-good/30 bg-good-soft p-5">
          <p className="font-semibold text-good">Approved</p>
          <p className="mt-1 text-sm text-ink-soft">Go back to the terminal — it will finish signing in.</p>
        </div>
      ) : (
        <form onSubmit={(e) => void approve(e)} className="mt-8 space-y-4">
          <label className="block">
            <span className="form-label">Device code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-2345"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              className="form-control mt-1.5 font-mono text-lg tracking-[0.2em]"
              required
            />
          </label>
          {error && <p role="alert" className="form-error">{error}</p>}
          <button type="submit" className="button-primary w-full" disabled={busy || code.trim().length < 8}>
            {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Checking…</> : "Approve CLI"}
          </button>
        </form>
      )}
      <p className="mt-8 text-sm text-ink-mute">
        Prefer a key? Create one under <Link href="/app/api-keys" className="font-semibold text-accent hover:underline">API &amp; keys</Link>.
      </p>
    </div>
  );
}
