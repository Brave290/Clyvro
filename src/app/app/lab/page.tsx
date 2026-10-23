"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, FlaskConical, LoaderCircle, Send } from "lucide-react";
import DomainVerify from "@/components/app/DomainVerify";
import { CopyButton } from "@/components/CopyCode";

interface Access { allowed: boolean; planName: string; catalogSize: number }
interface Probe {
  method: string; path: string; requestedUrl: string; finalUrl: string;
  status: number; contentType: string | null; durationMs: number;
  headers: Record<string, string>; body: string | null; truncated: boolean;
}
interface ScanRow {
  url: string; method: string; status: number; content_type: string | null;
  content_length: number | null; redirect_to?: string;
  headers_subset: Record<string, string>; mark: string; sensitive: boolean;
}
interface ScanReport {
  origin: string; pagesDiscovered: number; pagesScanned: number;
  sensitiveHits: number; stoppedOn: string | null; rows: ScanRow[];
}

const METHODS = ["GET", "HEAD", "OPTIONS"] as const;

function statusTone(status: number) {
  if (status >= 200 && status < 300) return "bg-good-soft text-good";
  if (status >= 300 && status < 400) return "bg-accent-soft text-accent";
  if (status >= 400 && status < 500) return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}

function statusLabel(status: number) {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No content", 301: "Moved", 302: "Found",
    304: "Not modified", 400: "Bad request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not found", 405: "Method not allowed", 429: "Too many requests",
    500: "Server error", 502: "Bad gateway", 503: "Unavailable",
  };
  return map[status] ?? "";
}

function markTone(mark: string) {
  if (mark === "EXPOSED") return "bg-bad-soft text-bad";
  if (mark === "FOUND") return "bg-good-soft text-good";
  if (mark === "REDIRECT") return "bg-accent-soft text-accent";
  if (mark === "MISSING") return "bg-canvas text-ink-mute";
  return "bg-warn-soft text-warn";
}

export default function LabPage() {
  const [mode, setMode] = useState<"request" | "site">("request");
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
  const [report, setReport] = useState<ScanReport | null>(null);

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
    setReport(null);
    try {
      const res = await fetch("/api/lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: mode === "site" ? "site" : "request",
          url, path, method,
          ownsOrAuthorized: owns, acceptLogs: logs, noThirdPartyAttack: noThird,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Lab request failed.");
      if (json.report) setReport(json.report as ScanReport);
      else setResult(json.result as Probe);
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
          Send a request, or scan every page we can find on a domain you prove you own.
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
            <div role="tablist" aria-label="Lab mode" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-canvas p-1">
              {([["request", "One request"], ["site", "Scan site"]] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={mode === id} disabled={busy}
                  onClick={() => setMode(id)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    mode === id ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:bg-surface hover:text-ink"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="lab-url" className="form-label">Website <span className="text-bad" aria-hidden>*</span></label>
              <input id="lab-url" required value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com" inputMode="url" className="form-control mt-1.5" disabled={busy} />
              {url.trim() && <DomainVerify targetUrl={url} variant="inline" />}
            </div>

            {mode === "request" && (
              <>
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
              </>
            )}

            {mode === "site" && (
              <p className="rounded-2xl border border-line bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
                Finds real pages (sitemap, robots, links, and common routes) plus the sensitive-file list.
                Same site only. HEAD first, then GET on live pages.
              </p>
            )}

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
                ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> {mode === "site" ? "Scanning…" : "Sending…"}</>
                : mode === "site"
                  ? <><FlaskConical size={15} aria-hidden /> Scan site</>
                  : <><Send size={15} aria-hidden /> Send request</>}
            </button>
          </section>

          <section className="min-h-80 overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.045)] lg:sticky lg:top-6" aria-label="Response">
            <div className="h-1 bg-accent" aria-hidden />
            <div className="p-5">
            {busy && (
              <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-ink-mute">
                <LoaderCircle size={22} className="animate-spin text-accent" aria-hidden />
                <p className="text-sm font-medium">{mode === "site" ? "Discovering and probing pages…" : "Waiting for the live response…"}</p>
              </div>
            )}
            {!busy && !result && !report && (
              <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <FlaskConical size={22} aria-hidden />
                </span>
                <p className="text-sm font-semibold">Live response</p>
                <p className="max-w-xs text-sm leading-relaxed text-ink-mute">
                  Send a request or scan the site. Results from the real pages show here.
                </p>
              </div>
            )}
            {!busy && result && <ResponsePanel result={result} />}
            {!busy && report && <ScanReportPanel report={report} />}
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

function formatResponse(result: Probe): string {
  const headerText = Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join("\n");
  const body = result.body === null ? `${result.method} has no response body.` : (result.body || "(empty)");
  return `${result.method} ${result.path} → HTTP ${result.status}\n${result.finalUrl}\n\n${headerText || "(no headers)"}\n\n${body}${result.truncated ? "\n…truncated" : ""}`;
}

function ResponsePanel({ result }: { result: Probe }) {
  const label = statusLabel(result.status);
  const headers = Object.entries(result.headers);
  const headerText = headers.map(([k, v]) => `${k}: ${v}`).join("\n");
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
      <div className="flex flex-wrap gap-2">
        <CopyButton text={formatResponse(result)} label="Copy all" />
        {headerText ? <CopyButton text={headerText} label="Copy headers" /> : null}
        {result.body ? <CopyButton text={result.body} label="Copy body" /> : null}
      </div>

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

function ScanReportPanel({ report }: { report: ScanReport }) {
  const json = useMemo(() => JSON.stringify(report, null, 2), [report]);
  const table = useMemo(
    () => report.rows.map((r) => `${r.mark}\t${r.status}\t${r.method}\t${r.url}`).join("\n"),
    [report.rows],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-canvas px-2.5 py-1 font-semibold">{report.pagesDiscovered} found</span>
        <span className="rounded-full bg-canvas px-2.5 py-1 font-semibold">{report.pagesScanned} scanned</span>
        <span className={`rounded-full px-2.5 py-1 font-semibold ${report.sensitiveHits ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
          {report.sensitiveHits} sensitive
        </span>
        {report.stoppedOn && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">Stopped on HTTP {report.stoppedOn}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <CopyButton text={table} label="Copy table" />
          <CopyButton text={json} label="Copy JSON" />
        </div>
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-2xl border border-line">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-canvas text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            <tr>
              <th className="px-3 py-2">Mark</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {report.rows.map((r) => (
              <tr key={`${r.method}:${r.url}`}>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${markTone(r.mark)}`}>{r.mark}</span></td>
                <td className="px-3 py-2 font-mono">{r.status || "—"}</td>
                <td className="px-3 py-2 font-mono [overflow-wrap:anywhere]">{r.url}{r.redirect_to ? ` → ${r.redirect_to}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
