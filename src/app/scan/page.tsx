"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ScanReport } from "@/lib/scanner/types";
import { deviceSignal, DEVICE_HEADER } from "@/lib/device";
import ReportView from "@/components/ReportView";
import { ConfirmDialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import {
  Radar, LoaderCircle, ShieldCheck, CircleAlert, CircleCheck, TriangleAlert,
  Globe, RotateCcw, Sparkles, Timer,
} from "lucide-react";

type ApiError = { code: string; message: string };
type View =
  | { kind: "idle" }
  | { kind: "scanning"; url: string }
  | { kind: "report"; report: ScanReport }
  | { kind: "error"; error: ApiError };

const WHAT_WE_CHECK = [
  "Links that lead nowhere, and forms that send people to dead pages",
  "Pages missing a title or description (what Google shows in results)",
  "Images and form fields that screen readers can't describe",
  "Pages that don't work properly on phones",
  "Personal details asked for over an unencrypted connection",
  "Homepages with no clear next step for visitors (we label this one a best guess)",
];

const EVIDENCE_POINTS = [
  ["Confirmed", "We saw it ourselves — for example, a link that returns “page not found”. Stated as fact."],
  ["Measured", "We measured it (like a loading time) and say so, including the limits of that measurement."],
  ["Best guess", "A pattern that usually means trouble. Flagged for a human to double-check — never dressed up as proof."],
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
        headers: { "content-type": "application/json", [DEVICE_HEADER]: deviceSignal() },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const error = (data?.error as ApiError) ?? { code: "INTERNAL", message: "The scan request failed. Please try again." };
        setView({ kind: "error", error });
        toast("error", "This URL can't be scanned", error.message);
      } else {
        const report = data as ScanReport;
        setView({ kind: "report", report });
        if (report.status === "failed") {
          toast("error", "We couldn't check this site", report.error?.message);
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
        <h1 className="text-4xl font-bold tracking-tight">Check a website</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Type in a website address and we&apos;ll visit it like a careful customer would — up to 10 pages —
          testing links, forms, and the basics every good site needs. Your first check is free.
          Only check sites you own or have permission to assess.{" "}
          <Link href="/sign-up" className="font-semibold text-accent hover:underline">Create a free account</Link>{" "}
          to save your reports, see what changed over time, and share them with clients.
        </p>
      </div>

      <form onSubmit={submit} aria-busy={scanning} style={{ animationDelay: "90ms" }} className="form-panel animate-fade-up mt-8">
        <label htmlFor="scan-url" className="form-label">Website address <span className="text-bad" aria-hidden="true">*</span></label>
        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Globe size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
            <input
              id="scan-url" type="text" inputMode="url" autoComplete="url" spellCheck={false} required
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="example.com or https://your-client-site.com/pricing"
              disabled={scanning}
              className="form-control pl-10"
            />
          </div>
          <button type="submit" disabled={scanning || !input.trim()}
            className="button-primary sm:shrink-0">
            {scanning ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Radar size={16} aria-hidden />}
            {scanning ? "Scanning…" : "Run scan"}
          </button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-mute">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-good" aria-hidden />
          Safe by design: we only visit public websites, look at up to 10 pages, and never fill in or submit any forms.
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
              Most scans finish in 10–45 seconds depending on the site. This quick scan isn&apos;t saved — keep this tab open,
              or sign in to save checks you can compare and share.
            </p>
          </div>
        )}

        {view.kind === "error" && view.error.code === "FREE_SCAN_USED" && (
          <div className="animate-fade-up mt-8 rounded-2xl border border-accent/25 bg-accent-soft/60 p-6" role="status">
            <p className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-accent" aria-hidden /> That was your free check</p>
            <p className="mt-2 text-sm leading-relaxed">
              Create a free account to keep going — you get 3 saved checks every month, full history,
              and report links you can send to clients. No card needed.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/sign-up" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover">
                Create free account
              </Link>
              <Link href="/sign-in" className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition hover:border-accent/50">
                I already have one
              </Link>
            </div>
          </div>
        )}

        {view.kind === "error" && view.error.code !== "FREE_SCAN_USED" && (
          <div className="animate-fade-up mt-8 rounded-2xl border border-bad/25 bg-bad-soft p-6" role="alert">
            <p className="flex items-center gap-2 font-semibold text-bad"><CircleAlert size={18} aria-hidden /> We couldn&apos;t check that address</p>
            <p className="mt-2 text-sm leading-relaxed">{view.error.message}</p>
            {view.error.code.startsWith("BLOCKED") && (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                That&apos;s our safety system doing its job: for everyone&apos;s protection, we only ever connect to
                normal public websites — never to private or internal addresses.
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
            <ReportView report={report} contextNote="not saved — sign in to keep your checks" />
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setConfirmDiscard(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-accent-hover hover:shadow-md">
                <RotateCcw size={15} aria-hidden /> Scan another site
              </button>
              <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition duration-200 hover:border-accent/50 hover:shadow-sm">
                Want saved reports &amp; share links? Create an account
              </Link>
            </div>
            <ConfirmDialog
              open={confirmDiscard}
              onCancel={() => setConfirmDiscard(false)}
              onConfirm={discardResults}
              title="Discard these scan results?"
              message="Quick scans on this page aren't saved. Signed-in audits under Projects are stored with full history, comparisons, and share links. Starting a new scan will clear this report from the page."
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
