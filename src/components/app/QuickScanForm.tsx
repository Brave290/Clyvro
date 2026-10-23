"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Layers, LoaderCircle, Radar, SearchCheck } from "lucide-react";
import { SCAN_MODES, SCAN_MODE_BLURBS, SCAN_MODE_LABELS, type ScanMode } from "@/lib/scan-modes";
import DomainVerify from "@/components/app/DomainVerify";
import { useToast } from "@/components/Toast";

interface QuickScanFormProps {
  planName: string;
  /** Plan includes private deep scans (Pro+). Locked option otherwise. */
  deepAllowed: boolean;
  /** e.g. "1 free deep scan (lifetime) · 1 left". Server enforces the cap. */
  deepNote?: string | null;
}

/**
 * The Scan tab's only job: paste an address, get a saved report.
 * Every run is a Full website check (the complete ruleset). Depth
 * only changes how much of the site we look at.
 */
export default function QuickScanForm({ planName, deepAllowed, deepNote }: QuickScanFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<ScanMode>("normal");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, auditTypes: ["generic"], locale: navigator.language, mode, consent: mode === "deep" ? consent : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't start the scan.");
      toast("success", "Scan queued", "Your report is being prepared.");
      router.push(`/app/audits/${data.auditId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the scan.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={busy} className="form-panel">
      <h2 className="flex items-center gap-2 font-semibold"><Radar size={17} className="text-accent" aria-hidden /> Full website check</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Paste a public address. Counts toward your {planName} plan.
      </p>
      {error && (
        <p role="alert" className="form-error mt-4">{error}</p>
      )}
      <label htmlFor="qs-url" className="form-label mt-5">Website address <span className="text-bad" aria-hidden="true">*</span></label>
      <input id="qs-url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)}
        autoComplete="url" placeholder="https://example.com" className="form-control mt-1.5" />
      <p className="form-hint">Only scan sites you own or have permission to check.</p>
      <fieldset className="mt-5">
        <legend className="form-label">Scan depth</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="group" aria-label="Scan depth">
          {SCAN_MODES.map((m) => {
            const active = mode === m;
            const locked = m === "deep" && !deepAllowed;
            const ModeIcon = m === "deep" ? Layers : m === "strict" ? SearchCheck : Gauge;
            return (
              <button
                key={m} type="button" disabled={locked}
                aria-pressed={active}
                title={locked ? "This plan's deep-scan allowance is used up — upgrade for more" : undefined}
                onClick={() => setMode(m)}
                className={`rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  active
                    ? "border-accent bg-accent-soft/60 ring-1 ring-accent/40"
                    : "border-line bg-surface hover:border-accent/50"
                } ${locked ? "cursor-not-allowed opacity-55 hover:border-line" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ModeIcon size={15} className={active ? "text-accent" : "text-ink-mute"} aria-hidden />
                  {SCAN_MODE_LABELS[m]}{locked ? <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Used up</span> : null}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{SCAN_MODE_BLURBS[m]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          Same rules and score at every depth — deeper just looks at more pages.
          {deepNote && <> Deep scans on {planName}: <strong className="text-ink-soft">{deepNote}</strong>.</>}
        </p>
        {mode === "deep" && (
          <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent-soft/50 p-3.5 text-sm leading-relaxed">
            <input
              type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#2563EB]" aria-label="Ownership consent for deep scan"
            />
            <span>
              I own this website, or I have the owner&apos;s permission to scan all of its pages.
              Deep scans read your sitemap and follow every internal link (forms are still never submitted;
              pages behind a login can&apos;t be checked).
            </span>
          </label>
        )}
      </fieldset>
      {mode === "deep" && deepAllowed && <DomainVerify targetUrl={url} />}

      <button type="submit" disabled={busy || (mode === "deep" && !consent)} className="button-primary mt-5">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Queuing…" : "Start scan"}
      </button>
    </form>
  );
}
