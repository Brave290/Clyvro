"use client";

/**
 * Canonical audit-report renderer (public scan, saved audit, share link).
 * Scoreboard first. Detail sections stay collapsed so the page stays short.
 */

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, CircleCheck, Files, ListFilter, ScanSearch, Timer } from "lucide-react";
import type { Category, ConfidenceBasis, Finding, Severity } from "@/lib/types";
import { confidenceLabel } from "@/lib/types";
import { auditTypeLabel } from "@/lib/plans";
import type { ScanReport } from "@/lib/scanner/types";
import { TECH_CATEGORY_LABELS, type TechCategory } from "@/lib/tech-detection";
import FindingCard from "@/components/FindingCard";
import { BrandSelect, ScoreRing, type BrandSelectOption } from "@/components/ui";
import { findingKey } from "@/lib/finding-key";
import LocalDateTime from "@/components/LocalDateTime";
import ReportExportBar from "@/components/ReportExportBar";

export interface FindingMeta {
  id: string;
  status: "open" | "acknowledged" | "dismissed";
}

interface ReportViewProps {
  report: ScanReport;
  contextNote?: string;
  findingMeta?: Record<string, FindingMeta>;
  onFindingStatus?: (findingId: string, status: FindingMeta["status"]) => void;
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
const PAGE_CHUNK = 10;

function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group mt-3 overflow-hidden rounded-xl border border-line bg-surface print:open">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-left marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="text-[13px] font-semibold">{title}</span>
          {hint && <span className="ml-2 text-[11px] text-ink-mute">{hint}</span>}
        </span>
        <ChevronDown size={15} className="shrink-0 text-ink-mute transition group-open:rotate-180 print:hidden" aria-hidden />
      </summary>
      <div className="border-t border-line px-3.5 py-3 print:block">{children}</div>
    </details>
  );
}

export default function ReportView({ report, contextNote, findingMeta, onFindingStatus, children }: ReportViewProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All categories");
  const [sev, setSev] = useState<(typeof SEVS)[number]>("All severities");
  const [conf, setConf] = useState<(typeof CONFS)[number]>("All confidence levels");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | FindingMeta["status"]>("active");
  const [pageSlice, setPageSlice] = useState(0);

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
  const risk = sevCount("critical") > 0 ? "Critical" : sevCount("high") > 0 ? "High" : sevCount("medium") > 0 ? "Medium" : sevCount("low") > 0 ? "Low" : "Clean";
  const riskCls = risk === "Clean" ? "bg-good-soft text-good" : risk === "Low" || risk === "Medium" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad";
  const pageRows = report.pages.slice(pageSlice * PAGE_CHUNK, pageSlice * PAGE_CHUNK + PAGE_CHUNK);
  const pageCount = Math.max(1, Math.ceil(report.pages.length / PAGE_CHUNK));

  return (
    <div data-print-area className="text-[13px] leading-snug">
      <div className="hidden print:mb-6 print:flex print:items-center print:gap-3 print:border-b print:border-line print:pb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white">
          <ScanSearch size={20} aria-hidden />
        </span>
        <span>
          <span className="block text-base font-bold tracking-tight">Clyvro report</span>
          <span className="block text-xs text-ink-mute">{report.finalUrl ?? report.target}</span>
        </span>
        <span className="ml-auto text-right text-xs text-ink-mute">Ruleset v{report.rulesetVersion}</span>
      </div>
      <ReportExportBar report={report} />

      <header className="mt-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="grid items-center justify-items-center gap-4 md:grid-cols-[auto_1fr] md:justify-items-start">
          <ScoreRing score={report.score ?? 0} size={108} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${riskCls}`}>{risk}</span>
              <span className="text-[11px] text-ink-mute">
                v{report.rulesetVersion}
                {report.auditTypes?.length ? ` · ${report.auditTypes.map(auditTypeLabel).join(", ")}` : ""}
                {contextNote ? ` · ${contextNote}` : ""}
              </span>
            </div>
            <h2 className="mt-1.5 break-all text-lg font-bold tracking-tight sm:text-xl">{report.finalUrl ?? report.target}</h2>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
              <div><dt className="flex items-center gap-1 text-ink-mute"><Files size={12} aria-hidden /> Pages</dt><dd className="font-semibold">{report.coverage.pagesParsed}/{report.coverage.pagesFetched}</dd></div>
              <div><dt className="flex items-center gap-1 text-ink-mute"><Timer size={12} aria-hidden /> Time</dt><dd className="font-semibold">{(report.durationMs / 1000).toFixed(1)}s</dd></div>
              <div><dt className="text-ink-mute">When</dt><dd className="font-semibold"><LocalDateTime value={report.startedAt} /></dd></div>
            </dl>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-bad-soft px-2 py-0.5 text-bad">{sevCount("critical")} critical</span>
              <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">{sevCount("high")} high</span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">{sevCount("medium")} medium</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">{sevCount("low")} low</span>
            </div>
          </div>
        </div>
      </header>

      <Fold title="What this scan covered" hint={risk}>
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-mute">
              <th className="py-1.5 pr-2 font-semibold">Check</th>
              <th className="py-1.5 pr-2 font-semibold">This run</th>
              <th className="py-1.5 font-semibold">Deep</th>
            </tr>
          </thead>
          <tbody className="[&_td]:py-1.5 [&_td]:pr-2">
            <tr><td>Stack &amp; headers</td><td className="font-semibold text-good">Yes</td><td className="font-semibold text-good">Yes</td></tr>
            <tr><td>Sensitive files</td><td className="text-ink-mute">—</td><td className="font-semibold text-good">Yes</td></tr>
            <tr><td>Injection probes</td><td className="text-ink-mute">—</td><td className="font-semibold text-good">Yes</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-mute">Observes pages as served. Forms are never submitted.</p>
      </Fold>

      {report.tech && report.tech.length > 0 && (
        <Fold title="Detected technology" hint={`${report.tech.length} signals`}>
          <div className="space-y-2">
            {([...new Set(report.tech.map((t) => t.category))] as TechCategory[]).map((category) => (
              <div key={category} className="flex flex-wrap items-center gap-1.5">
                <span className="w-28 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{TECH_CATEGORY_LABELS[category]}</span>
                {report.tech!.filter((t) => t.category === category).map((t) => (
                  <span key={`${t.name}-${t.category}`} title={t.evidence} className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[12px] font-semibold">
                    {t.name}{t.confidence === "inferred" && <span className="ml-1 font-medium text-ink-mute">(inferred)</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Fold>
      )}

      <div className="mt-4 flex flex-col gap-2 print:hidden sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex items-center gap-1.5 text-[13px] font-bold"><ListFilter size={14} aria-hidden /> Findings ({shown.length}/{report.findings.length})</span>
        <div className="grid gap-1.5 sm:ml-auto sm:flex sm:flex-wrap">
          <label className="sr-only" htmlFor={`rv-cat-${uid}`}>Category</label>
          <BrandSelect id={`rv-cat-${uid}`} value={cat} onChange={(v) => setCat(v as typeof cat)} options={toOptions(CATS)} className="w-full sm:w-[170px]" />
          <label className="sr-only" htmlFor={`rv-sev-${uid}`}>Severity</label>
          <BrandSelect id={`rv-sev-${uid}`} value={sev} onChange={(v) => setSev(v as typeof sev)} options={toOptions(SEVS)} className="w-full capitalize sm:w-[140px]" />
          <label className="sr-only" htmlFor={`rv-conf-${uid}`}>Confidence ({confidenceLabel("confirmed")} …)</label>
          <BrandSelect id={`rv-conf-${uid}`} value={conf} onChange={(v) => setConf(v as typeof conf)} options={toOptions(CONFS)} className="w-full sm:w-[180px]" />
          {findingMeta && (
            <>
              <label className="sr-only" htmlFor={`rv-status-${uid}`}>Finding status</label>
              <BrandSelect
                id={`rv-status-${uid}`}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                options={[
                  { value: "active", label: "Active" },
                  { value: "all", label: "All" },
                  { value: "open", label: "Open" },
                  { value: "acknowledged", label: "Acknowledged" },
                  { value: "dismissed", label: "Dismissed" },
                ]}
                className="w-full sm:w-[150px]"
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {report.findings.length === 0 ? (
          <div className="rounded-xl border border-good/25 bg-good-soft p-4" role="status">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-good"><CircleCheck size={16} aria-hidden /> No issues on this run</p>
            <p className="mt-1 text-[12px] text-ink-soft">{report.coverage.pagesParsed} pages read. Coverage is not a guarantee.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-5 text-center text-[12px] text-ink-mute">
            No findings match.{" "}
            <button className="font-semibold text-accent hover:underline" onClick={() => { setCat("All categories"); setSev("All severities"); setConf("All confidence levels"); setStatusFilter("active"); }}>Reset</button>
          </p>
        ) : (
          shown.map((f, i) => {
            const meta = findingMeta?.[findingKey(f)];
            return (
              <div key={findingKey(f)} className={meta?.status === "dismissed" ? "opacity-60" : undefined}>
                <FindingCard f={f} index={i} />
                {meta && onFindingStatus && (
                  <div className="mt-1.5 flex items-center justify-end gap-2">
                    <label className="text-[11px] font-medium text-ink-mute" htmlFor={`fs-${uid}-${meta.id}`}>
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
                      className="w-[150px]"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Fold title="Pages fetched" hint={`${report.pages.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead><tr className="border-b border-line bg-canvas text-[10px] uppercase tracking-wide text-ink-mute">
              <th className="px-2.5 py-2 font-semibold">URL</th><th className="px-2.5 py-2 font-semibold">Status</th><th className="px-2.5 py-2 font-semibold">Size</th><th className="px-2.5 py-2 font-semibold">Time</th><th className="px-2.5 py-2 font-semibold">Title</th>
            </tr></thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.url} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[240px] px-2.5 py-1.5 font-mono text-[11px] [overflow-wrap:anywhere]">{p.url}</td>
                  <td className="px-2.5 py-1.5">
                    {p.status === 0
                      ? <span className="rounded-full bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold text-bad">Failed</span>
                      : <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${p.status < 300 ? "bg-good-soft text-good" : p.status < 500 ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>{p.status}</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-ink-soft">{p.bytes ? `${(p.bytes / 1024).toFixed(1)} KB` : "—"}</td>
                  <td className="px-2.5 py-1.5 text-ink-soft">{p.durationMs ? `${p.durationMs} ms` : "—"}</td>
                  <td className="max-w-[180px] px-2.5 py-1.5 text-ink-soft [overflow-wrap:anywhere]">{p.title ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="mt-2 flex items-center justify-between text-[11px] print:hidden">
            <button type="button" disabled={pageSlice === 0} onClick={() => setPageSlice((n) => n - 1)} className="font-semibold text-accent disabled:text-ink-mute">Previous</button>
            <span className="text-ink-mute">{pageSlice + 1} / {pageCount}</span>
            <button type="button" disabled={pageSlice + 1 >= pageCount} onClick={() => setPageSlice((n) => n + 1)} className="font-semibold text-accent disabled:text-ink-mute">Next</button>
          </div>
        )}
      </Fold>

      <Fold title="Coverage" hint={`${report.coverage.maxPages} pages · depth ${report.coverage.maxDepth}`}>
        <dl className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
          {[
            ["Read", `${report.coverage.pagesParsed}`],
            ["Links found", `${report.coverage.linksDiscovered}`],
            ["Links checked", `${report.coverage.linksChecked}`],
            ["Forms checked", `${report.coverage.formDestinationsChecked}`],
            ["Unchecked", `${report.coverage.linksUnchecked}`],
            ["robots.txt skip", `${report.coverage.skippedByRobots}`],
            ["Truncated", `${report.coverage.truncatedPages}`],
            ["Bounds", `${report.coverage.maxPages} · d${report.coverage.maxDepth}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-canvas px-2.5 py-2"><dt className="text-[10px] text-ink-mute">{k}</dt><dd className="font-semibold">{v}</dd></div>
          ))}
        </dl>
        {report.limitations.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-line pt-2 text-[11px] text-ink-soft">
            {report.limitations.slice(0, 4).map((l) => <li key={l}>• {l}</li>)}
          </ul>
        )}
      </Fold>

      {children}
    </div>
  );
}
