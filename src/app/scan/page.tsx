"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ScanReport } from "@/lib/scanner/types";
import type { Category, ConfidenceBasis, Severity } from "@/lib/types";
import { SEVERITY_DEDUCTION } from "@/lib/types";
import { ScoreRing, BrandSelect } from "@/components/ui";
import FindingCard from "@/components/FindingCard";
import { ConfirmDialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import {
  Radar, LoaderCircle, ShieldCheck, CircleAlert, CircleCheck, TriangleAlert,
  Globe, Files, ListFilter, RotateCcw, Info, Timer,
} from "lucide-react";

type ApiError = { code: string; message: string };
type View =
  | { kind: "idle" }
  | { kind: "scanning"; url: string }
  | { kind: "report"; report: ScanReport }
  | { kind: "error"; error: ApiError };

const CATS: ("All categories" | Category)[] = ["All categories", "Conversion", "Performance", "SEO & discoverability", "Accessibility", "Reliability"];
const SEVS: ("All severities" | Severity)[] = ["All severities", "critical", "high", "medium", "low"];
const CONFS: ("All confidence levels" | ConfidenceBasis)[] = ["All confidence levels", "confirmed", "measured", "heuristic"];

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

const WHAT_WE_CHECK = [
  "Broken internal links and dead form destinations",
  "Missing or duplicated page titles & meta descriptions",
  "Images missing alt text, form fields without labels",
  "Missing mobile viewport, page language, and main heading",
  "Sensitive forms served over unencrypted HTTP",
  "Landing pages with no detectable call-to-action (labelled as a heuristic)",
];

const EVIDENCE_POINTS = [
  ["Confirmed", "Directly observed — an HTTP status, a missing attribute. Stated as fact."],
  ["Measured", "Observed through a measurement, with its limits stated next to it."],
  ["Heuristic", "A pattern-based inference for human review. Never dressed up as proof."],
];

function useElapsed(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    setSecs(0);
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return secs;
}

function ScanPageInner() {
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });
  const [cat, setCat] = useState<(typeof CATS)[number]>("All categories");
  const [sev, setSev] = useState<(typeof SEVS)[number]>("All severities");
  const [conf, setConf] = useState<(typeof CONFS)[number]>("All confidence levels");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const elapsed = useElapsed(view.kind === "scanning");
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRanRef = useRef(false);
  const { toast } = useToast();

  const runScan = useCallback(async (url: string) => {
    setView({ kind: "scanning", url });
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const error = (data?.error as ApiError) ?? { code: "INTERNAL", message: "The scan request failed. Please try again." };
        setView({ kind: "error", error });
        toast("error", "This URL can't be scanned", error.message);
      } else {
        const report = data as ScanReport;
        setCat("All categories"); setSev("All severities"); setConf("All confidence levels");
        setView({ kind: "report", report });
        if (report.status === "failed") {
          toast("error", "The scan couldn't audit this site", report.error?.message);
        } else {
          toast(
            "success",
            report.status === "partial" ? "Scan completed (partial coverage)" : "Scan completed",
            `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"} across ${report.coverage.pagesParsed} page${report.coverage.pagesParsed === 1 ? "" : "s"} — score ${report.score}/100.`,
          );
        }
      }
    } catch {
      const error = { code: "NETWORK", message: "We couldn't reach the scanner. Check your connection and try again." };
      setView({ kind: "error", error });
      toast("error", "Network problem", error.message);
    }
  }, [toast]);

  // Deep link from the homepage form: /scan?url=example.com → prefill + run once.
  useEffect(() => {
    if (autoRanRef.current) return;
    const url = searchParams.get("url")?.trim();
    if (url) {
      autoRanRef.current = true;
      setInput(url);
      void runScan(url);
    }
  }, [searchParams, runScan]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (!url || view.kind === "scanning") return;
    await runScan(url);
  }

  useEffect(() => {
    if (view.kind === "report" || view.kind === "error") {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [view]);

  const report = view.kind === "report" ? view.report : null;
  const shown = useMemo(() => {
    if (!report) return [];
    return report.findings.filter(
      (f) =>
        (cat === "All categories" || f.category === cat) &&
        (sev === "All severities" || f.severity === sev) &&
        (conf === "All confidence levels" || f.confidenceBasis === conf),
    );
  }, [report, cat, sev, conf]);

  const sevCount = (s: Severity) => report?.findings.filter((f) => f.severity === s).length ?? 0;
  const confCount = (c: ConfidenceBasis) => report?.findings.filter((f) => f.confidenceBasis === c).length ?? 0;
  const scanning = view.kind === "scanning";

  const discardResults = () => {
    setConfirmDiscard(false);
    setView({ kind: "idle" });
    setInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="animate-fade-up max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft">
          <span className="animate-pulse-dot h-2 w-2 rounded-full bg-good" /> Real scanner — results are live, not saved yet
        </p>
        <h1 className="mt-5 text-4xl font-bold tracking-tight">Scan a website</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Enter a public website address and Clyvro will fetch it (plus up to 9 more pages on the same site),
          verify its internal links and form destinations, and report evidence-backed findings from ruleset v1.0.0.
          Only scan sites you own or are authorized to assess.
        </p>
      </div>

      <form onSubmit={submit} style={{ animationDelay: "90ms" }} className="animate-fade-up mt-8 rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <label htmlFor="scan-url" className="text-sm font-medium">Website address</label>
        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Globe size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
            <input
              id="scan-url" type="text" inputMode="url" autoComplete="off" spellCheck={false}
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="example.com or https://your-client-site.com/pricing"
              disabled={scanning}
              className="w-full rounded-lg border border-line bg-surface py-2.5 pl-10 pr-3.5 text-sm outline-none transition duration-200 hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
            />
          </div>
          <button type="submit" disabled={scanning || !input.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0 disabled:translate-y-0 disabled:opacity-60 disabled:hover:shadow-sm">
            {scanning ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Radar size={16} aria-hidden />}
            {scanning ? "Scanning…" : "Run scan"}
          </button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-mute">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-good" aria-hidden />
          Safety boundary: public http/https only · private/internal/IP-literal targets blocked · every redirect re-validated ·
          max 10 pages, 2 clicks deep, strict size &amp; time limits · forms are never submitted.
        </p>
      </form>

      {view.kind === "idle" && (
        <div style={{ animationDelay: "180ms" }} className="animate-fade-up mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="font-semibold">What gets checked</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
              {WHAT_WE_CHECK.map((c) => (
                <li key={c} className="flex gap-2"><CircleCheck size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />{c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="font-semibold">How to read the evidence</h2>
            <dl className="mt-3 space-y-3 text-sm leading-relaxed">
              {EVIDENCE_POINTS.map(([k, v]) => (
                <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-ink-soft">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-ink-soft">
              Localhost and internal addresses are refused by design.{" "}
              <Link href="/how-it-works" className="font-semibold text-accent hover:underline">How the scanner works →</Link>
            </p>
          </div>
        </div>
      )}

      <div ref={resultsRef} className="scroll-mt-24">
        {scanning && (
          <div className="animate-fade-in mt-8 rounded-2xl border border-accent/25 bg-accent-soft/60 p-6" role="status" aria-live="polite">
            <p className="flex flex-wrap items-center gap-2 font-semibold"><LoaderCircle size={18} className="animate-spin text-accent" aria-hidden /> <span className="min-w-0 break-all">Scanning {view.url}…</span> <span className="ml-auto flex items-center gap-1 text-sm font-medium text-ink-soft"><Timer size={14} aria-hidden /> {elapsed}s</span></p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Validating the address, crawling same-origin pages, and verifying links and form destinations.
              Most scans finish in 10–45 seconds depending on the site. Results appear here — they aren&apos;t saved, so keep this tab open.
            </p>
          </div>
        )}

        {view.kind === "error" && (
          <div className="animate-fade-up mt-8 rounded-2xl border border-bad/25 bg-bad-soft p-6" role="alert">
            <p className="flex items-center gap-2 font-semibold text-bad"><CircleAlert size={18} aria-hidden /> This URL can&apos;t be scanned</p>
            <p className="mt-2 text-sm leading-relaxed">{view.error.message}</p>
            {view.error.code.startsWith("BLOCKED") && (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                This refusal is Clyvro&apos;s SSRF protection working as designed: the scanner only ever connects to public web servers on standard ports,
                and it validates the destination IP of the submitted URL and every redirect before connecting.
              </p>
            )}
          </div>
        )}

        {report && report.status === "failed" && (
          <div className="animate-fade-up mt-8 rounded-2xl border border-warn/30 bg-warn-soft p-6" role="alert">
            <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} className="text-warn" aria-hidden /> The scan couldn&apos;t audit this site</p>
            <p className="mt-2 text-sm leading-relaxed">{report.error?.message ?? "The scan failed."}</p>
            <p className="mt-2 break-all text-xs text-ink-mute">Target: {report.target} · {new Date(report.startedAt).toLocaleString()}</p>
          </div>
        )}

        {report && report.status !== "failed" && (
          <>
            <header className="animate-fade-up mt-8 rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8">
              <div className="grid justify-items-center gap-8 md:grid-cols-[auto_1fr] md:items-center md:justify-items-start">
                <ScoreRing score={report.score ?? 0} size={150} />
                <div className="w-full min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-good px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:text-slate-950">Real scan</span>
                    {report.status === "partial" && <span className="rounded-full bg-warn px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:text-slate-950">Partial — time limit hit</span>}
                    <span className="text-xs font-medium text-ink-mute">Ruleset v{report.rulesetVersion} · not saved</span>
                  </div>
                  <h2 className="mt-3 break-all text-2xl font-bold tracking-tight">Audit — {report.finalUrl ?? report.target}</h2>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div><dt className="flex items-center gap-1.5 font-medium text-ink-mute"><Files size={14} aria-hidden /> Pages read in full</dt><dd className="mt-0.5 font-semibold">{report.coverage.pagesParsed} of {report.coverage.pagesFetched} fetched</dd></div>
                    <div><dt className="flex items-center gap-1.5 font-medium text-ink-mute"><Timer size={14} aria-hidden /> Scan time</dt><dd className="mt-0.5 font-semibold">{(report.durationMs / 1000).toFixed(1)}s</dd></div>
                    <div><dt className="font-medium text-ink-mute">Scanned at</dt><dd className="mt-0.5 font-semibold">{new Date(report.startedAt).toLocaleString()}</dd></div>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-bad-soft px-3 py-1.5 text-bad">{sevCount("critical")} critical</span>
                    <span className="rounded-full bg-warn-soft px-3 py-1.5 text-warn">{sevCount("high")} high</span>
                    <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">{sevCount("medium")} medium</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">{sevCount("low")} low</span>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                    <strong className="text-ink">Observations vs inferences:</strong> {confCount("confirmed")} confirmed by direct observation
                    {confCount("measured") > 0 ? ` · ${confCount("measured")} measured` : ""} · {confCount("heuristic")} heuristic (needs human review).
                  </p>
                  <p className="mt-3 rounded-xl bg-canvas p-4 text-xs leading-relaxed text-ink-soft">
                    <strong className="text-ink">Score:</strong> 100 − ({SEVERITY_DEDUCTION.critical}×critical + {SEVERITY_DEDUCTION.high}×high + {SEVERITY_DEDUCTION.medium}×medium + {SEVERITY_DEDUCTION.low}×low).
                    An internal prioritisation score — not a conversion rate or revenue estimate.
                  </p>
                </div>
              </div>
            </header>

            <div className="animate-fade-up mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={{ animationDelay: "80ms" }}>
              <span className="flex items-center gap-1.5 text-sm font-semibold"><ListFilter size={16} aria-hidden /> Findings ({shown.length} of {report.findings.length})</span>
              <div className="grid gap-2 sm:ml-auto sm:flex sm:flex-wrap">
                <label className="sr-only" htmlFor="s-cat">Category</label>
                <BrandSelect id="s-cat" value={cat} onChange={(v) => setCat(v as typeof cat)} options={toOptions(CATS)} className="w-full sm:w-[190px]" />
                <label className="sr-only" htmlFor="s-sev">Severity</label>
                <BrandSelect id="s-sev" value={sev} onChange={(v) => setSev(v as typeof sev)} options={toOptions(SEVS)} className="w-full capitalize sm:w-[160px]" />
                <label className="sr-only" htmlFor="s-conf">Confidence</label>
                <BrandSelect id="s-conf" value={conf} onChange={(v) => setConf(v as typeof conf)} options={toOptions(CONFS)} className="w-full sm:w-[200px]" />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {report.findings.length === 0 ? (
                <div className="animate-scale-in rounded-2xl border border-good/25 bg-good-soft p-6" role="status">
                  <p className="flex items-center gap-2 font-semibold text-good"><CircleCheck size={18} aria-hidden /> No issues detected</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    Ruleset v{report.rulesetVersion} found nothing to flag on the {report.coverage.pagesParsed} page(s) read in full
                    and {report.coverage.linksChecked + report.coverage.formDestinationsChecked} verified link/form destination(s).
                    That&apos;s evidence within this scan&apos;s coverage — not a guarantee the site is flawless. See the limitations below.
                  </p>
                </div>
              ) : shown.length === 0 ? (
                <p className="animate-fade-in rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-mute">
                  No findings match these filters.{" "}
                  <button className="font-semibold text-accent hover:underline" onClick={() => { setCat("All categories"); setSev("All severities"); setConf("All confidence levels"); }}>Reset filters</button>
                </p>
              ) : (
                shown.map((f, i) => <FindingCard key={`${f.ruleId}-${f.page}-${i}`} f={f} index={i} />)
              )}
            </div>

            <section className="animate-fade-up mt-10" style={{ animationDelay: "120ms" }} aria-label="Scanned pages">
              <h3 className="text-lg font-semibold">Pages fetched</h3>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead><tr className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-ink-mute">
                    <th className="px-4 py-3 font-semibold">URL</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Size</th><th className="px-4 py-3 font-semibold">Time</th><th className="px-4 py-3 font-semibold">Title</th>
                  </tr></thead>
                  <tbody>
                    {report.pages.map((p) => (
                      <tr key={p.url} className="border-b border-line/60 last:border-0">
                        <td className="max-w-[280px] truncate px-4 py-2.5 font-mono text-xs">{p.url}</td>
                        <td className="px-4 py-2.5">
                          {p.status === 0
                            ? <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-semibold text-bad">Failed</span>
                            : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status < 300 ? "bg-good-soft text-good" : p.status < 500 ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>{p.status}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-soft">{p.bytes ? `${(p.bytes / 1024).toFixed(1)} KB` : "—"}</td>
                        <td className="px-4 py-2.5 text-ink-soft">{p.durationMs ? `${p.durationMs} ms` : "—"}</td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-soft">{p.title ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-mute">Response times are single observations from our server&apos;s location during this scan — context only, not a performance grade.</p>
            </section>

            <section className="animate-fade-up mt-8 rounded-2xl border border-line bg-surface p-6" style={{ animationDelay: "160ms" }} aria-label="Coverage and limitations">
              <h3 className="flex items-center gap-2 font-semibold"><Info size={17} className="text-accent" aria-hidden /> Coverage &amp; limitations</h3>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Pages read in full", `${report.coverage.pagesParsed}`],
                  ["Links discovered", `${report.coverage.linksDiscovered}`],
                  ["Links verified", `${report.coverage.linksChecked}`],
                  ["Form destinations checked", `${report.coverage.formDestinationsChecked}`],
                  ["Links not verified (limits)", `${report.coverage.linksUnchecked}`],
                  ["Skipped by robots.txt", `${report.coverage.skippedByRobots}`],
                  ["Oversized pages (partial)", `${report.coverage.truncatedPages}`],
                  ["Crawl bounds", `${report.coverage.maxPages} pages · depth ${report.coverage.maxDepth}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-canvas px-4 py-3"><dt className="text-xs font-medium text-ink-mute">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
                ))}
              </dl>
              <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft">
                {report.limitations.map((l) => <li key={l}>• {l}</li>)}
              </ul>
            </section>

            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setConfirmDiscard(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0">
                <RotateCcw size={15} aria-hidden /> Scan another site
              </button>
              <Link href="/#waitlist" className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition duration-200 hover:border-accent/50 hover:shadow-sm">
                Want saved reports? Join Clyvro Dev
              </Link>
            </div>

            <ConfirmDialog
              open={confirmDiscard}
              onCancel={() => setConfirmDiscard(false)}
              onConfirm={discardResults}
              title="Discard these scan results?"
              message="Scans aren't saved yet — accounts and audit history arrive with Clyvro Dev early access. Starting a new scan will clear this report from the page."
              confirmLabel="Discard & scan another"
              cancelLabel="Keep viewing"
              destructive
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-5 py-12 text-sm text-ink-mute">Loading scanner…</div>}>
      <ScanPageInner />
    </Suspense>
  );
}
