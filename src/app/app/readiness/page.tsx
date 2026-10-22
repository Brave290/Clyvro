"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gauge, Info, LoaderCircle, ShieldAlert, TriangleAlert, XCircle } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { TECH_CATEGORY_LABELS, type TechCategory } from "@/lib/tech-detection";
import ExportBar from "@/components/ExportBar";
import { checkReportToAgentBrief, checkReportToMarkdown, exportSlug } from "@/lib/check-export";

type Status = "pass" | "warn" | "fail" | "info";
interface RCheck { id: string; group: string; label: string; status: Status; detail: string }
interface Report {
  domain: string; finalUrl: string | null; tier: "basic" | "full";
  checks: RCheck[]; tech: { name: string; evidence: string; category: TechCategory; confidence: "direct" | "inferred" }[];
  facts: { label: string; value: string }[];
  summary: { pass: number; warn: number; fail: number; total: number };
}
interface Access { tier: "basic" | "full"; planName: string; trial: { active: boolean; endsAt: string | null; used: boolean } }
interface Row { id: string; domain: string; tier: string; summary: Report["summary"]; results: Report; createdAt: string }

const STATUS_ICON: Record<Status, React.ReactNode> = {
  pass: <CheckCircle2 size={16} className="shrink-0 text-good" aria-hidden />,
  warn: <TriangleAlert size={16} className="shrink-0 text-warn" aria-hidden />,
  fail: <XCircle size={16} className="shrink-0 text-bad" aria-hidden />,
  info: <Info size={16} className="shrink-0 text-ink-mute" aria-hidden />,
};

function ReportBlock({ report }: { report: Report }) {
  const groups = [...new Set(report.checks.map((c) => c.group))];
  const extras = [
    `Tier: ${report.tier === "full" ? "Full checks" : "Basic checks"}`,
    ...report.facts.map((f) => `${f.label}: ${f.value}`),
    ...(report.tech.length ? [`Detected technology: ${report.tech.map((t) => t.name).join(", ")}`] : []),
  ];
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportBar
          content={{
            markdown: checkReportToMarkdown("Project Readiness", report.domain, report.checks, extras),
            agentPrompt: checkReportToAgentBrief("a Clyvro Project Readiness check", report.domain, report.checks, extras),
            json: JSON.stringify({ tool: "clyvro-readiness", exportedAt: new Date().toISOString(), report }, null, 2),
            slug: exportSlug("readiness", report.domain),
          }}
        />
      </div>
      <div className="flex flex-wrap gap-3" role="status">
        <span className="rounded-xl bg-good-soft px-3 py-1.5 text-sm font-bold text-good">{report.summary.pass} passed</span>
        <span className="rounded-xl bg-warn-soft px-3 py-1.5 text-sm font-bold text-warn">{report.summary.warn} to improve</span>
        <span className="rounded-xl bg-bad-soft px-3 py-1.5 text-sm font-bold text-bad">{report.summary.fail} failing</span>
        <span className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold text-ink-soft">{report.tier === "full" ? "Full checks" : "Basic checks"}</span>
      </div>

      {report.facts.length > 0 && (
        <dl className="grid gap-2 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
          {report.facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2 last:border-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{f.label}</dt>
              <dd className="text-right text-sm font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {report.tech.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold">Detected technology</h3>
          <div className="mt-3 space-y-3">
            {([...new Set(report.tech.map((t) => t.category))] as TechCategory[]).map((category) => (
              <div key={category} className="flex flex-wrap items-center gap-2">
                <span className="w-36 text-xs font-bold uppercase tracking-wide text-ink-mute">{TECH_CATEGORY_LABELS[category]}</span>
                {report.tech.filter((t) => t.category === category).map((t) => (
                  <span key={`${t.name}-${t.category}`} title={t.evidence} className="rounded-full border border-line bg-canvas px-3 py-1 text-xs font-semibold">
                    {t.name}
                    {t.confidence === "inferred" && <span className="ml-1 font-medium text-ink-mute">(inferred)</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-mute">
            Public signals only: HTML/assets, headers, cookies, DNS, and platform domains. Backend code is not visible; hover for evidence.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g} className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold">{g}</h3>
          <ul className="mt-3 space-y-2.5">
            {report.checks.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="flex items-start gap-2.5">
                {STATUS_ICON[c.status]}
                <span>
                  <span className="block text-sm font-semibold">{c.label}</span>
                  <span className="block text-sm leading-relaxed text-ink-soft">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ReadinessPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Report | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/readiness");
    const json = await res.json().catch(() => null);
    if (res.ok && json) { setAccess(json.access as Access); setHistory(json.history as Row[]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Keep plan/trial state and history live without a manual refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const trialOver = access?.trial.used && !access.trial.active && access.planName !== "Pro" && access.planName !== "Ultra Agency";

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The readiness check couldn't run.");
      setCurrent(json.report as Report);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The readiness check couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Project Readiness</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Facts-only domain profile: stack, hosting, registration, TLS, security headers, and email authentication from live signals.
        </p>
        {access && (
          <p className="mt-2 text-sm text-ink-soft">
            Your {access.planName} plan: <strong className="text-ink">{access.tier === "full" ? "Full checks" : "Basic checks"}</strong>
            {access.trial.active && access.trial.endsAt && <> · trial runs until <LocalDateTime value={access.trial.endsAt} /></>}
            {!access.trial.used && access.planName !== "Pro" && access.planName !== "Ultra Agency" && <> · your first check opens a 24-hour trial</>}
          </p>
        )}
      </header>

      {trialOver ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2 font-semibold"><ShieldAlert size={17} className="text-warn" aria-hidden /> Trial ended</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Your 24-hour trial ended. Pro includes monthly Basic checks; Ultra Agency adds Full checks.
          </p>
          <a href="/app/billing" className="button-primary mt-4 inline-flex">See plans</a>
        </div>
      ) : (
        <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="rd-domain" className="form-label">Domain <span className="text-bad" aria-hidden="true">*</span></label>
            <input id="rd-domain" required value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" inputMode="url"
              className="form-control mt-1.5" disabled={busy} />
          </div>
          <button type="submit" disabled={busy} className="button-primary">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Gauge size={15} aria-hidden />}
            {busy ? "Checking…" : "Check domain"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="form-error mt-4">{error}</p>}
      {busy && (
        <div className="mt-6 animate-pulse space-y-3" aria-busy="true" aria-label="Running readiness check">
          <div className="h-10 w-72 rounded-xl bg-line/60" />
          <div className="h-32 rounded-2xl bg-line/50" />
          <div className="h-48 rounded-2xl bg-line/50" />
        </div>
      )}

      {current && !busy && (
        <section aria-label="Latest readiness report" className="mt-8">
          <h2 className="mb-4 text-lg font-bold">{current.domain}</h2>
          <ReportBlock report={current} />
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="Previous readiness checks" className="mt-10">
          <h2 className="text-lg font-bold">History</h2>
          <ul className="mt-4 space-y-2">
            {history.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => setCurrent(row.results)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                  <span className="flex-1 truncate font-semibold" title={row.domain}>{row.domain}</span>
                  <span className="text-xs text-ink-mute">{row.tier === "full" ? "Full" : "Basic"}</span>
                  <span className="text-xs font-semibold text-good">{row.summary.pass} pass</span>
                  <span className="text-xs font-semibold text-warn">{row.summary.warn} improve</span>
                  <span className="text-xs font-semibold text-bad">{row.summary.fail} fail</span>
                  <span className="text-xs text-ink-mute"><LocalDateTime value={row.createdAt} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
