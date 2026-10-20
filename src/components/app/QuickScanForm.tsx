"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Layers, LoaderCircle, Radar, SearchCheck } from "lucide-react";
import { AUDIT_TYPES, type AuditType } from "@/lib/plans";
import { SCAN_MODES, SCAN_MODE_BLURBS, SCAN_MODE_LABELS, type ScanMode } from "@/lib/scan-modes";
import { useToast } from "@/components/Toast";

interface QuickScanFormProps {
  allowedTypes: AuditType[];
  planName: string;
  /** Plan includes private deep scans (Pro+). Locked option otherwise. */
  deepAllowed: boolean;
}

/**
 * The Scan tab's only job: paste an address, get a saved report.
 * No project/website has to be created first — the audit is still
 * quota-charged, saved, shareable, and counted like any other.
 */
export default function QuickScanForm({ allowedTypes, planName, deepAllowed }: QuickScanFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<AuditType[]>(["generic"]);
  const [mode, setMode] = useState<ScanMode>("normal");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(type: AuditType) {
    if (type === "generic") {
      setSelected(["generic"]);
      return;
    }
    setSelected((cur) => {
      const base = cur.filter((t) => t !== "generic");
      const next = base.includes(type) ? base.filter((t) => t !== type) : [...base, type];
      return next.length ? next : ["generic"];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, auditTypes: selected, locale: navigator.language, mode, consent: mode === "deep" ? consent : undefined }),
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
      <h2 className="flex items-center gap-2 font-semibold"><Radar size={17} className="text-accent" aria-hidden /> Scan a website</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Paste any public address — no need to save the website first. The scan runs in the
        background, counts toward your {planName} plan, and the report is saved here.
      </p>
      {error && (
        <p role="alert" className="form-error mt-4">{error}</p>
      )}
      <label htmlFor="qs-url" className="form-label mt-5">Website address <span className="text-bad" aria-hidden="true">*</span></label>
      <input id="qs-url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)}
        autoComplete="url" placeholder="https://example.com" className="form-control mt-1.5" />
      <p className="form-hint">Only scan websites you own or are authorized to assess.</p>
      <fieldset className="mt-5">
        <legend className="form-label">Audit types</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AUDIT_TYPES.map((t) => {
            const allowed = allowedTypes.includes(t.id) || t.id === "generic";
            const active = selected.includes(t.id);
            return (
              <button
                key={t.id} type="button" disabled={!allowed}
                aria-pressed={active}
                title={allowed ? t.blurb : `${t.name} isn't included in the ${planName} plan`}
                onClick={() => toggle(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-accent text-white shadow-sm"
                    : "border border-line bg-surface hover:border-accent/50"
                } ${!allowed ? "cursor-not-allowed opacity-45 hover:border-line" : ""}`}
              >
                {t.name}{!allowed ? " · higher plan" : ""}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          Focused audits run the rule subset for that concern; Generic Audit runs the full ruleset.
        </p>
      </fieldset>
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
                title={locked ? "Deep private scans are included in Pro and above" : undefined}
                onClick={() => setMode(m)}
                className={`rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  active
                    ? "border-accent bg-accent-soft/60 ring-1 ring-accent/40"
                    : "border-line bg-surface hover:border-accent/50"
                } ${locked ? "cursor-not-allowed opacity-55 hover:border-line" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ModeIcon size={15} className={active ? "text-accent" : "text-ink-mute"} aria-hidden />
                  {SCAN_MODE_LABELS[m]}{locked ? <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Pro</span> : null}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{SCAN_MODE_BLURBS[m]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          All depths use the same rules and scoring — deeper modes simply look at more of the site.
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
      <button type="submit" disabled={busy || (mode === "deep" && !consent)} className="button-primary mt-5">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Queuing…" : "Start scan"}
      </button>
    </form>
  );
}
