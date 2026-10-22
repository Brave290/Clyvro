"use client";
import { useState } from "react";
import type { Finding } from "@/lib/types";
import { SeverityBadge, ConfidenceBadge } from "./ui";
import { ChevronDown, FileSearch, Wrench, Clock, FileCode2 } from "lucide-react";

/**
 * One finding, shown in full. Details used to hide behind a closed
 * accordion in tiny type — the report now opens on the page so you can
 * read it without hunting. Collapse is optional. Print/PDF always shows
 * the full finding (download-as-report is unchanged).
 */
export default function FindingCard({ f, index = 0 }: { f: Finding; index?: number }) {
  const [open, setOpen] = useState(true);
  return (
    <article
      style={{ animationDelay: `${index * 70}ms` }}
      className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:border-accent/40 hover:shadow-[0_6px_24px_rgba(15,23,42,0.07)]"
    >
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="group flex w-full items-start gap-4 p-5 text-left sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge s={f.severity} />
            <ConfidenceBadge b={f.confidenceBasis} />
            <span className="text-sm font-medium text-ink-mute">{f.category} · {f.ruleId} v{f.ruleVersion}</span>
          </div>
          <h3 className="mt-2.5 text-lg font-bold leading-snug transition-colors duration-200 group-hover:text-accent-deep">{f.title}</h3>
          <p className="mt-2 text-base leading-relaxed text-ink-soft">{f.explanation}</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-mute">
            <FileCode2 size={15} aria-hidden /> Page:{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-sm text-ink-soft [overflow-wrap:anywhere]">{f.page}</code>
          </p>
        </div>
        <ChevronDown size={20} className={`mt-1 shrink-0 text-ink-mute transition duration-300 group-hover:text-accent print:hidden ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-out print:grid-rows-[1fr] print:opacity-100 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 print:opacity-100"}`}>
        <div className="overflow-hidden">
          <div className="space-y-5 border-t border-line bg-canvas/60 px-5 py-5 sm:px-6 sm:py-6">
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink">
                <FileSearch size={16} aria-hidden /> Evidence
              </h4>
              <ul className="mt-2 space-y-1.5">
                {f.evidence.map((e) => (
                  <li key={e} className="rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{e}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-accent/20 bg-accent-soft/60 p-4 sm:p-5">
              <h4 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-accent-deep">
                <Wrench size={16} aria-hidden /> Recommended fix
              </h4>
              <p className="mt-2 text-base leading-relaxed text-ink">{f.recommendation}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                <Clock size={15} aria-hidden /> Estimated effort: {f.effort}
              </p>
            </div>
            <p className="text-base leading-relaxed text-ink-soft">
              <span className="font-bold text-ink">Why it matters — and what we can&apos;t claim: </span>
              {f.impactRationale}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
