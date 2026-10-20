"use client";

/**
 * The canonical audit-report renderer. Used by:
 *  - /scan            (ephemeral public scan, no finding lifecycle)
 *  - /app/audits/[id] (persisted report, finding status controls)
 *  - /shared/[token]  (public read-only share)
 * Renders the Phase 2 ScanReport contract exactly as the scanner produces it.
 * (Extracted from the /scan page in Phase 3 — same design, shared code.)
 */

import { useId, useState, type ReactNode } from "react";
import { CircleCheck, Files, Info, ListFilter, Timer } from "lucide-react";
import type { Category, ConfidenceBasis, Finding, Severity } from "@/lib/types";
import { SEVERITY_DEDUCTION, confidenceLabel } from "@/lib/types";
import type { ScanReport } from "@/lib/scanner/types";
import FindingCard from "@/components/FindingCard";
import { BrandSelect, ScoreRing, type BrandSelectOption } from "@/components/ui";
import { findingKey } from "@/lib/finding-key";

export interface FindingMeta {
  id: string;
  status: "open" | "acknowledged" | "dismissed";
}

interface ReportViewProps {
  report: ScanReport;
  /** Short context note shown beside the ruleset chip, e.g. "not saved" or "shared report". */
  contextNote?: string;
  /** Present in the signed-in app: finding lifecycle (open/acknowledged/dismissed). */
  findingMeta?: Record<string, FindingMeta>;
  onFindingStatus?: (findingId: string, status: FindingMeta["status"]) => void;
  /** Extra content appended after coverage (e.g. actions, comparison panel). */
  children?: ReactNode;
}

const CATS: ("All categories" | Category)[] = [
  "All categories", "Conversion", "Performance", "SEO & discoverability", "Accessibility", "Reliability",
];
const SEVS: ("All severities" | Severity)[] = ["All severities", "critical", "high", "medium", "low"];
const CONFS: ("All confidence levels" | ConfidenceBasis)[] = [
  "All confidence levels", "confirmed", "measured", "heuristic",
];

const toOptions = (values: string[]): BrandSelectOption[] => values.map((v) => ({ value: v, label: v }));

export default function ReportView({ report, contextNote, findingMeta, onFindingStatus, children }: ReportViewProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All categories");
  const [sev, setSev] = useState<(typeof SEVS)[number]>("All severities");
  const [conf, setConf] = useState<(typeof CONFS)[number]>("All confidence levels");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | FindingMeta["status"]>("active");

  const statusOf = (f: Finding) => findingMeta?.[findingKey(f)]?.status ?? "open";
  const shown = report.findings.filter(
    (f) =>
      (cat === "All categories" || f.category === cat) &&
      (sev === "All severities" || f.severity === sev) &&
      (conf === "All confidence levels" || f.confidenceBasis === conf) &&
      (!findingMeta ||
        statusFilter === "all" ||
        (statusFilter === "active" ? statusOf(f) !== "dismissed" : statusOf(f) === statusFilter)),
  );

  const sevCount = (s: Severity) => report.findings.filter((f) => f.severity === s).length;
  const confCount = (c: ConfidenceBasis) => report.findings.filter((f) => f.confidenceBasis === c).length;

  return (
    <>
      <header className="animate-fade-up mt-8 rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8">
        <div className="grid justify-items-center gap-8 md:grid-cols-[auto_1fr] md:items-center md:justify-items-start">
          <ScoreRing score={report.score ?? 0} size={150} />
          <div className="w-full min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-good px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:text-slate-950">Real scan</span>
              {report.status === "partial" && <span className="rounded-full bg-warn px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:text-slate-950">Partial — time limit hit</span>}
              <span className="text-xs font-medium text-ink-mute">
                Ruleset v{report.rulesetVersion}
                {report.auditTypes && report.auditTypes.length > 0 ? ` · ${report.auditTypes.join(", ")}` : ""}
                {contextNote ? ` · ${contextNote}` : ""}
              </span>
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
          <label className="sr-only" htmlFor={`rv-cat-${uid}`}>Category</label>
          <BrandSelect id={`rv-cat-${uid}`} value={cat} onChange={(v) => setCat(v as typeof cat)} options={toOptions(CATS)} className="w-full sm:w-[190px]" />
          <label className="sr-only" htmlFor={`rv-sev-${uid}`}>Severity</label>
          <BrandSelect id={`rv-sev-${uid}`} value={sev} onChange={(v) => setSev(v as typeof sev)} options={toOptions(SEVS)} className="w-full capitalize sm:w-[160px]" />
          <label className="sr-only" htmlFor={`rv-conf-${uid}`}>Confidence ({confidenceLabel("confirmed")} …)</label>
          <BrandSelect id={`rv-conf-${uid}`} value={conf} onChange={(v) => setConf(v as typeof conf)} options={toOptions(CONFS)} className="w-full sm:w-[200px]" />
          {findingMeta && (
            <>
              <label className="sr-only" htmlFor={`rv-status-${uid}`}>Finding status</label>
              <BrandSelect
                id={`rv-status-${uid}`}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                options={[
                  { value: "active", label: "Active (not dismissed)" },
                  { value: "all", label: "All statuses" },
                  { value: "open", label: "Open" },
                  { value: "acknowledged", label: "Acknowledged" },
                  { value: "dismissed", label: "Dismissed" },
                ]}
                className="w-full sm:w-[200px]"
              />
            </>
          )}
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
            <button className="font-semibold text-accent hover:underline" onClick={() => { setCat("All categories"); setSev("All severities"); setConf("All confidence levels"); setStatusFilter("active"); }}>Reset filters</button>
          </p>
        ) : (
          shown.map((f, i) => {
            const meta = findingMeta?.[findingKey(f)];
            return (
              <div key={findingKey(f)} className={meta?.status === "dismissed" ? "opacity-60" : undefined}>
                <FindingCard f={f} index={i} />
                {meta && onFindingStatus && (
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <label className="text-xs font-medium text-ink-mute" htmlFor={`fs-${uid}-${meta.id}`}>
                      Status: <span className="capitalize text-ink">{meta.status}</span>
                    </label>
                    <BrandSelect
                      id={`fs-${uid}-${meta.id}`}
                      value={meta.status}
                      onChange={(v) => onFindingStatus(meta.id, v as FindingMeta["status"])}
                      options={[
                        { value: "open", label: "Open" },
                        { value: "acknowledged", label: "Acknowledged" },
                        { value: "dismissed", label: "Dismissed" },
                      ]}
                      className="w-[170px]"
                    />
                  </div>
                )}
              </div>
            );
          })
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

      {children}
    </>
  );
}
