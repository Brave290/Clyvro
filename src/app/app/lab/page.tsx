"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, FlaskConical, LoaderCircle, Send } from "lucide-react";
import DomainVerify from "@/components/app/DomainVerify";

interface Access { allowed: boolean; planName: string; catalogSize: number }
interface Probe {
  method: string; path: string; requestedUrl: string; finalUrl: string;
  status: number; contentType: string | null; durationMs: number;
  headers: Record<string, string>; body: string | null; truncated: boolean;
}

const METHODS = ["GET", "HEAD", "OPTIONS"] as const;

function statusTone(status: number) {
  if (status >= 200 && status < 300) return "bg-good-soft text-good";
  if (status >= 300 && status < 400) return "bg-accent-soft text-accent";
  if (status >= 400 && status < 500) return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}

function statusLabel(status: number) {
  if (status === 200) return "OK";
  if (status === 201) return "Created";
  if (status === 204) return "No content";
  if (status === 301) return "Moved";
  if (status === 302) return "Found";
  if (status === 304) return "Not modified";
  if (status === 400) return "Bad request";
  if (status === 401) return "Unauthorized";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 405) return "Method not allowed";
  if (status === 429) return "Too many requests";
  if (status === 500) return "Server error";
  if (status === 502) return "Bad gateway";
  if (status === 503) return "Unavailable";
  return "";
}

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
  const canSend = owns && logs && noThird && !busy;

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
          Lab
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Beta</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Send a request to a domain you prove you own.
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
        <form onSubmit={(e) => void send(e)} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)] lg:items-start">
          <section className="form-panel space-y-5">
            <div>
              <label htmlFor="lab-url" className="form-label">Website <span className="text-bad" aria-hidden>*</span></label>
              <input id="lab-url" required value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com" inputMode="url" className="form-control mt-1.5" disabled={busy} />
              {url.trim() && <DomainVerify targetUrl={url} variant="inline" />}
            </div>

            <fieldset>
              <legend className="form-label">Method</legend>
              <div role="radiogroup" aria-label="HTTP method" className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-2xl border border-line bg-canvas p-1">
                {METHODS.map((m) => {
                  const on = method === m;
                  return (
                    <button key={m} type="button" role="radio" aria-checked={on} disabled={busy}
                      onClick={() => setMethod(m)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        on ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:bg-surface hover:text-ink"
                      }`}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="lab-path" className="form-label">Path</label>
              <div className="mt-1.5 flex overflow-hidden rounded-xl border border-line bg-surface focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
                <span className="grid shrink-0 place-items-center bg-canvas px-3 font-mono text-xs font-bold text-accent">{method}</span>
                <input id="lab-path" required value={path} onChange={(e) => setPath(e.target.value)}
                  placeholder="/" className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-sm outline-none" disabled={busy} />
              </div>
            </div>

            <div>
              <label htmlFor="lab-q" className="form-label">Paths</label>
              <input id="lab-q" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search paths" className="form-control mt-1.5" disabled={busy} />
              <ul className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-line bg-canvas">
                {catalog.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-ink-mute">No matching paths</li>
                )}
                {catalog.map((p) => {
                  const on = p === path;
                  return (
                    <li key={p} className="border-b border-line/70 last:border-0">
                      <button type="button" onClick={() => setPath(p)} disabled={busy}
                        className={`flex w-full items-center px-3 py-2 text-left font-mono text-[12px] leading-snug [overflow-wrap:anywhere] ${
                          on ? "bg-accent text-white" : "text-ink-soft hover:bg-surface hover:text-ink"
                        }`}>
                        {p}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <fieldset className="space-y-2">
              <legend className="form-label">Authorization</legend>
              <ConsentRow checked={owns} disabled={busy} onChange={setOwns}>
                I own this site or have written permission to test it.
              </ConsentRow>
              <ConsentRow checked={logs} disabled={busy} onChange={setLogs}>
                I accept this request may appear in the site&apos;s logs.
              </ConsentRow>
              <ConsentRow checked={noThird} disabled={busy} onChange={setNoThird}>
                I will not use Lab to attack anyone else.
              </ConsentRow>
            </fieldset>

            {error && <p role="alert" className="form-error">{error}</p>}

            <button type="submit" className="button-primary w-full" disabled={!canSend}>
              {busy
                ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Sending…</>
                : <><Send size={15} aria-hidden /> Send request</>}
            </button>
          </section>

          <section className="min-h-80 overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.045)] lg:sticky lg:top-6" aria-label="Response">
            <div className="h-1 bg-accent" aria-hidden />
            <div className="p-5">
            {busy && (
              <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-ink-mute">
                <LoaderCircle size={22} className="animate-spin text-accent" aria-hidden />
                <p className="text-sm font-medium">Waiting for the live response…</p>
              </div>
            )}
            {!busy && !result && (
              <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <FlaskConical size={22} aria-hidden />
                </span>
                <p className="text-sm font-semibold">Live response</p>
                <p className="max-w-xs text-sm leading-relaxed text-ink-mute">
                  Send a request. Headers and body from the real page show here.
                </p>
              </div>
            )}
            {!busy && result && <ResponsePanel result={result} />}
            </div>
          </section>
        </form>
      )}
    </div>
  );
}

function ConsentRow({
  checked, disabled, onChange, children,
}: {
  checked: boolean; disabled: boolean; onChange: (next: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 transition ${
      checked ? "border-accent/40 bg-accent-soft/60" : "border-line bg-canvas hover:border-accent/30"
    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${
        checked ? "bg-accent text-white" : "border border-line bg-surface"
      }`}>
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <span className="text-sm leading-relaxed text-ink-soft">{children}</span>
    </label>
  );
}

function ResponsePanel({ result }: { result: Probe }) {
  const label = statusLabel(result.status);
  const headers = Object.entries(result.headers);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-bold ${statusTone(result.status)}`}>
          {result.status}{label ? ` ${label}` : ""}
        </span>
        <span className="rounded-full bg-canvas px-2.5 py-1 font-mono text-xs font-semibold text-accent">{result.method}</span>
        <span className="font-mono text-xs text-ink-soft [overflow-wrap:anywhere]">{result.path}</span>
        <span className="ml-auto text-xs font-medium text-ink-mute">{result.durationMs} ms</span>
      </div>
      <p className="truncate font-mono text-[11px] text-ink-mute" title={result.finalUrl}>{result.finalUrl}</p>

      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">Headers</h2>
        {headers.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mute">No headers</p>
        ) : (
          <dl className="mt-2 max-h-48 overflow-auto rounded-2xl border border-line bg-canvas">
            {headers.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-2 border-b border-line/70 px-3 py-2 last:border-0">
                <dt className="truncate font-mono text-[11px] font-semibold text-accent" title={k}>{k}</dt>
                <dd className="font-mono text-[11px] leading-relaxed text-ink-soft [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {result.body !== null ? (
        <div>
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">
            Body
            {result.truncated && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold text-warn">Truncated</span>}
          </h2>
          <pre className="mt-2 max-h-80 overflow-auto rounded-2xl border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-soft whitespace-pre-wrap [overflow-wrap:anywhere]">
            {result.body || "(empty)"}
          </pre>
        </div>
      ) : (
        <p className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-sm text-ink-mute">
          {result.method} has no response body.
        </p>
      )}
    </div>
  );
}
