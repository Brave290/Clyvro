"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { SAMPLE_FINDINGS, SAMPLE_SITE } from "@/lib/sample-report";
import { auditScore, SEVERITY_DEDUCTION, type Category, type Severity } from "@/lib/types";
import { ScoreRing } from "@/components/ui";
import FindingCard from "@/components/FindingCard";
import { TriangleAlert, Globe, Files, ListFilter } from "lucide-react";

const CATS: ("All categories" | Category)[] = ["All categories", "Conversion", "Performance", "SEO & discoverability", "Accessibility", "Reliability"];
const SEVS: ("All severities" | Severity)[] = ["All severities", "critical", "high", "medium", "low"];
const count = (s: Severity) => SAMPLE_FINDINGS.filter(f => f.severity === s).length;

export default function ExampleReport() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All categories");
  const [sev, setSev] = useState<(typeof SEVS)[number]>("All severities");
  const shown = useMemo(() => SAMPLE_FINDINGS.filter(f => (cat === "All categories" || f.category === cat) && (sev === "All severities" || f.severity === sev)), [cat, sev]);
  const score = auditScore(SAMPLE_FINDINGS);
  return (<div className="mx-auto max-w-5xl px-5 py-12">
    <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-5" role="note">
      <TriangleAlert className="mt-0.5 shrink-0 text-warn" size={20} />
      <p className="text-sm leading-relaxed"><strong>This is a sample report using fictional data.</strong> “{SAMPLE_SITE.name}” and its findings were written to demonstrate Clyvro&apos;s report format, evidence standard, and scoring formula. No real website was scanned — the live scanner is Phase 2 of the <Link href="/how-it-works" className="font-semibold text-accent-deep hover:underline">roadmap</Link>.</p></div>

    <header className="mt-8 rounded-3xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-8">
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <ScoreRing score={score} size={150} />
        <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Website audit — {SAMPLE_SITE.name}</h1>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="flex items-center gap-1.5 font-medium text-ink-mute"><Globe size={14} /> Site</dt><dd className="mt-0.5 font-mono text-xs">{SAMPLE_SITE.url}</dd></div>
            <div><dt className="flex items-center gap-1.5 font-medium text-ink-mute"><Files size={14} /> Pages checked</dt><dd className="mt-0.5 font-semibold">{SAMPLE_SITE.pagesCrawled}</dd></div>
            <div><dt className="font-medium text-ink-mute">Ruleset</dt><dd className="mt-0.5 font-semibold">{SAMPLE_SITE.rulesetVersion}</dd></div></dl>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-bad-soft px-3 py-1.5 text-bad">{count("critical")} critical</span>
            <span className="rounded-full bg-warn-soft px-3 py-1.5 text-warn">{count("high")} high</span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{count("medium")} medium</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{count("low")} low</span></div>
          <p id="score" className="mt-5 scroll-mt-24 rounded-xl bg-canvas p-4 text-xs leading-relaxed text-ink-soft"><strong className="text-ink">How the score works:</strong> start at 100, subtract {SEVERITY_DEDUCTION.critical} per critical, {SEVERITY_DEDUCTION.high} per high, {SEVERITY_DEDUCTION.medium} per medium and {SEVERITY_DEDUCTION.low} per low finding (floor 0). It is an internal audit score for prioritisation — <strong className="text-ink">not</strong> a conversion rate or revenue prediction.</p>
        </div></div></header>

    <div className="mt-8 flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-1.5 text-sm font-semibold"><ListFilter size={16} /> Findings ({shown.length} of {SAMPLE_FINDINGS.length})</span>
      <div className="ml-auto flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="f-cat">Category</label>
        <select id="f-cat" value={cat} onChange={e => setCat(e.target.value as typeof cat)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent">{CATS.map(c => <option key={c}>{c}</option>)}</select>
        <label className="sr-only" htmlFor="f-sev">Severity</label>
        <select id="f-sev" value={sev} onChange={e => setSev(e.target.value as typeof sev)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm capitalize outline-none focus:border-accent">{SEVS.map(s => <option key={s} value={s}>{s}</option>)}</select>
      </div></div>

    <div className="mt-4 space-y-4">
      {shown.length === 0
        ? <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-mute">No findings match these filters. <button className="font-semibold text-accent hover:underline" onClick={() => { setCat("All categories"); setSev("All severities"); }}>Reset filters</button></p>
        : shown.map(f => <FindingCard key={f.ruleId} f={f} />)}
    </div>
    <p className="mt-8 text-center text-sm text-ink-mute">Want a report like this — with real findings from your client&apos;s site? <Link href="/#waitlist" className="font-semibold text-accent hover:underline">Join the pilot waitlist</Link>.</p>
  </div>);
}
