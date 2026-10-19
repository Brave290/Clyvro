"use client";
import { useState } from "react";
import type { Finding } from "@/lib/types";
import { SeverityBadge, ConfidenceBadge } from "./ui";
import { ChevronDown, FileSearch, Wrench, Clock, FileCode2 } from "lucide-react";

export default function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  return (<article className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-4 p-5 text-left">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge s={f.severity} /><ConfidenceBadge b={f.confidenceBasis} />
          <span className="text-xs font-medium text-ink-mute">{f.category} · {f.ruleId} v{f.ruleVersion}</span>
        </div>
        <h3 className="mt-2.5 font-semibold leading-snug">{f.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-mute"><FileCode2 size={13} /> Page: <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">{f.page}</code></p>
      </div>
      <ChevronDown size={18} className={`mt-1 shrink-0 text-ink-mute transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && (<div className="space-y-5 border-t border-line bg-canvas/60 px-5 py-5">
      <p className="text-sm leading-relaxed text-ink-soft">{f.explanation}</p>
      <div><h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-mute"><FileSearch size={14} /> Evidence</h4>
        <ul className="mt-2 space-y-1.5">{f.evidence.map(e => <li key={e} className="rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink-soft">{e}</li>)}</ul></div>
      <div className="rounded-xl border border-accent/20 bg-accent-soft/50 p-4">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-deep"><Wrench size={14} /> Recommended fix</h4>
        <p className="mt-1.5 text-sm leading-relaxed">{f.recommendation}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><Clock size={13} /> Estimated effort: {f.effort}</p></div>
      <p className="text-xs leading-relaxed text-ink-mute"><span className="font-semibold text-ink-soft">Why it matters — and what we can&apos;t claim: </span>{f.impactRationale}</p>
    </div>)}
  </article>);
}
