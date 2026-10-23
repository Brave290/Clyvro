"use client";
import { useState } from "react";
import type { Finding } from "@/lib/types";
import { SeverityBadge, ConfidenceBadge } from "./ui";
import { ChevronDown, FileSearch, Wrench, Clock, FileCode2 } from "lucide-react";

/**
 * One finding. Closed by default; print/PDF still shows the full card
 * (download-as-report is unchanged).
 */
export default function FindingCard({ f, index = 0 }: { f: Finding; index?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      style={{ animationDelay: `${index * 40}ms` }}
      className="overflow-hidden rounded-xl border border-line bg-surface"
    >
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="group flex w-full items-start gap-3 p-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge s={f.severity} />
            <ConfidenceBadge b={f.confidenceBasis} />
            <span className="text-[11px] font-medium text-ink-mute">{f.category} · {f.ruleId}</span>
          </div>
          <h3 className="mt-1.5 text-[14px] font-bold leading-snug group-hover:text-accent-deep">{f.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-mute">
            <FileCode2 size={12} aria-hidden />
            <code className="rounded bg-canvas px-1 py-0.5 font-mono [overflow-wrap:anywhere]">{f.page}</code>
          </p>
        </div>
        <ChevronDown size={16} className={`mt-0.5 shrink-0 text-ink-mute print:hidden ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid print:grid-rows-[1fr] print:opacity-100 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 print:opacity-100"}`}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-line bg-canvas/60 px-3.5 py-3">
            <p className="text-[12px] leading-snug text-ink-soft">{f.explanation}</p>
            <div>
              <h4 className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink">
                <FileSearch size={13} aria-hidden /> Evidence
              </h4>
              <ul className="mt-1.5 space-y-1">
                {f.evidence.map((e) => (
                  <li key={e} className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink [overflow-wrap:anywhere]">{e}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-accent/20 bg-accent-soft/60 p-3">
              <h4 className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent-deep">
                <Wrench size={13} aria-hidden /> Fix
              </h4>
              <p className="mt-1 text-[12px] text-ink">{f.recommendation}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-soft">
                <Clock size={12} aria-hidden /> {f.effort}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
