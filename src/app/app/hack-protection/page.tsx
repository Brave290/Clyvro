"use client";
import { useState } from "react";
import { LoaderCircle, ShieldHalf } from "lucide-react";
import CheckReport, { ReportSkeleton, SummaryPills, type CheckItem } from "@/components/app/CheckReport";
import { RemainingNote, UpgradePanel, useToolAccess } from "@/components/app/ToolGate";
import ExportBar from "@/components/ExportBar";
import { checkReportToAgentBrief, checkReportToMarkdown, exportSlug } from "@/lib/check-export";

interface HackReport {
  domain: string;
  finalUrl: string | null;
  checks: CheckItem[];
  summary: { pass: number; warn: number; fail: number; total: number };
  probedPaths: { path: string; status: number | null }[];
}

/**
 * Hack Protection (Beta): safe, read-only security posture scanning.
 * Checks only what any visitor can already observe — it never attempts
 * an exploit, never submits forms and never uses credentials.
 */
export default function HackProtectionPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<HackReport | null>(null);

  const { access, refresh } = useToolAccess("hack-protection");
  const exhausted = access !== null && !access.allowed;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hack-protection", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The security scan couldn't run.");
      setReport(json.report as HackReport);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The security scan couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Hack Protection
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Beta</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          See your site the way an attacker&apos;s first five minutes look: transport security, protective
          headers, cookie flags, information leaks, and whether sensitive files like <code className="text-ink">.env</code> or{" "}
          <code className="text-ink">.git</code> are publicly reachable. It&apos;s read-only — no exploits, no
          form submissions, no credentials — and every result shows exactly what was observed and how to fix it.
          Only scan sites you own or are authorised to test.
        </p>
      </header>

      {exhausted && access ? <UpgradePanel access={access} /> : (<>
      <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="hp-url" className="form-label">Website to protect <span className="text-bad" aria-hidden="true">*</span></label>
          <input id="hp-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" inputMode="url"
            className="form-control mt-1.5" disabled={busy} />
        </div>
        <button type="submit" disabled={busy} className="button-primary">
          {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <ShieldHalf size={15} aria-hidden />}
          {busy ? "Scanning…" : "Run protection scan"}
        </button>
      </form>
      {error && <p role="alert" className="form-error mt-4">{error}</p>}
      <RemainingNote access={access} />
      </>)}
      {busy && <ReportSkeleton />}

      {report && !busy && (
        <section aria-label="Protection report" className="mt-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold">{report.domain}</h2>
            <p className="mt-1 text-sm text-ink-mute">
              Probed paths: {report.probedPaths.map((p) => `${p.path} → ${p.status ?? "no answer"}`).join(" · ")}
            </p>
          </div>
          <SummaryPills summary={report.summary} />
          <div className="flex justify-end">
            <ExportBar
              content={{
                markdown: checkReportToMarkdown("Hack Protection", report.domain, report.checks, [`Probed paths: ${report.probedPaths.map((p) => `${p.path} → ${p.status ?? "no answer"}`).join(" · ")}`]),
                agentPrompt: checkReportToAgentBrief("a Clyvro Hack Protection check", report.domain, report.checks, ["This was a public, non-intrusive surface check — not a penetration test."]),
                json: JSON.stringify({ tool: "clyvro-hack-protection", exportedAt: new Date().toISOString(), report }, null, 2),
                slug: exportSlug("hack-protection", report.domain),
              }}
            />
          </div>
          <CheckReport checks={report.checks} />
          <p className="text-xs leading-relaxed text-ink-mute">
            A clean report means the publicly visible attack surface we check is tidy — it is not a penetration
            test and can&apos;t see logged-in areas, server-side code or third-party breaches. Pair it with
            updates, backups and least-privilege accounts.
          </p>
        </section>
      )}
    </div>
  );
}
