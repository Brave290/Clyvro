"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Layers, LoaderCircle, Radar, SearchCheck } from "lucide-react";
import { AUDIT_TYPES, type AuditType } from "@/lib/plans";
import { SCAN_MODES, SCAN_MODE_BLURBS, SCAN_MODE_LABELS, type ScanMode } from "@/lib/scan-modes";
import DomainVerify from "@/components/app/DomainVerify";
import { useToast } from "@/components/Toast";

interface RunAuditFormProps {
  projectId: string;
  defaultUrl: string;
  allowedTypes: AuditType[];
  planName: string;
  /** Plan includes private deep scans (Pro+). Locked option otherwise. */
  deepAllowed: boolean;
}

export default function RunAuditForm({ projectId, defaultUrl, allowedTypes, planName, deepAllowed }: RunAuditFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = useState(defaultUrl);
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
      const res = await fetch(`/api/projects/${projectId}/audits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, auditTypes: selected, locale: navigator.language, mode, consent: mode === "deep" ? consent : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't start the audit.");
      toast("success", "Audit queued", "The scan is running in the background.");
      router.push(`/app/audits/${data.auditId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the audit.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={busy} className="form-panel">
      <h2 className="flex items-center gap-2 font-semibold"><Radar size={17} className="text-accent" aria-hidden /> Run an audit</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Audits run in the background and are saved to this project. {planName} plan limits apply.
      </p>
      {error && (
        <p role="alert" className="form-error mt-4">{error}</p>
      )}
      <label htmlFor="ra-url" className="form-label mt-5">Start URL <span className="text-bad" aria-hidden="true">*</span></label>
      <input id="ra-url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)}
        autoComplete="url" className="form-control mt-1.5" />
      <p className="form-hint">Use an address on this project&apos;s registered website so its checks stay grouped correctly.</p>
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
          Categories deepen phase by phase — a focused audit never fakes checks that don&apos;t exist yet.
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
          All depths use the same rules and scoring, so reports stay comparable — deeper modes simply look at more of the site.
        </p>
        {mode === "deep" && (
          <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent-soft/50 p-3.5 text-sm leading-relaxed">
            <input
              type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#2563EB]" aria-label="Ownership consent for deep scan"
            />
            <span>
              I own this website, or I have the owner&apos;s permission to scan all of its pages.
              Deep scans read the sitemap and follow every internal link (forms are still never submitted;
              pages behind a login can&apos;t be checked).
            </span>
          </label>
        )}
      </fieldset>
      {mode === "deep" && deepAllowed && <DomainVerify targetUrl={url} />}

      <button type="submit" disabled={busy || (mode === "deep" && !consent)}
        className="button-primary mt-5">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Queuing…" : "Start audit"}
      </button>
    </form>
  );
}
