"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, LoaderCircle } from "lucide-react";
import DomainVerify from "@/components/app/DomainVerify";

interface Access { allowed: boolean; planName: string; catalogSize: number }
interface Probe {
  method: string; path: string; requestedUrl: string; finalUrl: string;
  status: number; contentType: string | null; durationMs: number;
  headers: Record<string, string>; body: string | null; truncated: boolean;
}

const METHODS = ["GET", "HEAD", "OPTIONS"] as const;

export default function LabPage() {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("/");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET");
  const [owns, setOwns] = useState(false);
  const [logs, setLogs] = useState(false);
  const [noThird, setNoThird] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Probe | null>(null);

  const load = useCallback(async (q = "") => {
    const res = await fetch(`/api/lab${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setAccess(json.access as Access);
      setCatalog((json.catalog as string[]) ?? []);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { void load(query); }, 250);
    return () => clearTimeout(t);
  }, [query, load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url, path, method,
          ownsOrAuthorized: owns, acceptLogs: logs, noThirdPartyAttack: noThird,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Lab request failed.");
      setResult(json.result as Probe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lab request failed.");
    } finally {
      setBusy(false);
    }
  }

  const lockedOut = access && !access.allowed;

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Lab
          <FlaskConical size={22} className="text-accent" aria-hidden />
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Authorized HTTP repeater for ethical hackers. GET, HEAD and OPTIONS on a domain you prove you own —
          plus {access?.catalogSize ?? "500+"} built-in path checks. No brute force, no inject payloads, no exploit PoCs.
          For a full report, use Pentest.
        </p>
      </header>

      {lockedOut && (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6">
          <h2 className="font-semibold">Lab is on Pro and Agency</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Your workspace is on the <strong className="text-ink">{access.planName}</strong> plan.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/pricing" className="button-primary">Compare plans</Link>
            <Link href="/app/billing" className="button-secondary">Go to billing</Link>
          </div>
        </div>
      )}

      {!lockedOut && (
        <form onSubmit={(e) => void send(e)} className="form-panel mt-6 space-y-4">
          <div>
            <label htmlFor="lab-url" className="form-label">Website <span className="text-bad" aria-hidden>*</span></label>
            <input id="lab-url" required value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com" inputMode="url" className="form-control mt-1.5" disabled={busy} />
          </div>
          {url.trim() && <DomainVerify targetUrl={url} />}
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div>
              <label htmlFor="lab-method" className="form-label">Method</label>
              <select id="lab-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}
                className="form-control mt-1.5" disabled={busy}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lab-path" className="form-label">Path</label>
              <input id="lab-path" required value={path} onChange={(e) => setPath(e.target.value)}
                placeholder="/.env" className="form-control mt-1.5 font-mono text-sm" disabled={busy} />
            </div>
          </div>
          <div>
            <label htmlFor="lab-q" className="form-label">Path catalogue</label>
            <input id="lab-q" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter .env, git, swagger…" className="form-control mt-1.5" disabled={busy} />
            <ul className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-line bg-canvas p-2">
              {catalog.map((p) => (
                <li key={p}>
                  <button type="button" onClick={() => setPath(p)}
                    className={`rounded-lg px-2 py-1 font-mono text-[11px] ${p === path ? "bg-accent text-white" : "bg-surface text-ink-soft hover:bg-accent-soft"}`}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1" checked={owns} onChange={(e) => setOwns(e.target.checked)} disabled={busy} />
            I own this site or have written permission to test it.
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1" checked={logs} onChange={(e) => setLogs(e.target.checked)} disabled={busy} />
            I accept this request may appear in the site&apos;s logs.
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1" checked={noThird} onChange={(e) => setNoThird(e.target.checked)} disabled={busy} />
            I will not use Lab to attack anyone else.
          </label>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button type="submit" className="button-primary" disabled={busy || !owns || !logs || !noThird}>
            {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Sending…</> : "Send request"}
          </button>
        </form>
      )}

      {result && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5" aria-label="Response">
          <p className="text-sm font-semibold">
            {result.method} {result.path} → HTTP {result.status}
            <span className="ml-2 text-xs font-medium text-ink-mute">{result.durationMs} ms · {result.finalUrl}</span>
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-canvas p-3 text-[11px] leading-relaxed text-ink-soft">
            {Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join("\n") || "(no headers)"}
          </pre>
          {result.body !== null && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-canvas p-3 text-[11px] leading-relaxed text-ink-soft">
              {result.body || "(empty body)"}{result.truncated ? "\n…truncated" : ""}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
