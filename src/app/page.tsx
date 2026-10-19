import Link from "next/link";
import { ArrowRight, FileSearch, ShieldCheck, Gauge, ListChecks, FlaskConical, Eye } from "lucide-react";
import { SAMPLE_FINDINGS, SAMPLE_SITE } from "@/lib/sample-report";
import { auditScore } from "@/lib/types";
import { ScoreRing, SeverityBadge } from "@/components/ui";
import WaitlistForm from "@/components/WaitlistForm";

const PILLARS = [
  { Icon: FileSearch, t: "Evidence, not opinions", d: "Every finding carries a rule ID, the exact observation behind it, and how it was detected. If we can't show it, we don't claim it." },
  { Icon: FlaskConical, t: "Honest about uncertainty", d: "Confirmed failures, lab measurements, and heuristics are labelled differently — because they are different. No heuristic is dressed up as proof." },
  { Icon: ListChecks, t: "Prioritised for client work", d: "Findings are ranked by severity with an estimated fix effort, so you can hand a client a plan instead of a pile of warnings." },
];
const CHECKS = ["Broken forms & dead-end links", "Missing titles & meta descriptions", "Mobile call-to-action visibility", "Image alt text & form labels", "Lab performance (LCP, blocking resources)", "Mobile viewport & layout basics"];

export default function Home() {
  const top = SAMPLE_FINDINGS.slice(0, 3);
  return (<>
    <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
      <div className="max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-ink-soft"><span className="h-2 w-2 rounded-full bg-good" /> Now building — pilot opens with the audit MVP</p>
        <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Find the friction.<br /><span className="text-accent">Fix the conversion.</span></h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">Clyvro audits client websites for verifiable technical, usability, and conversion issues — then shows the evidence behind every finding, so your recommendations survive a client asking <em>“how do you know?”</em></p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/example-report" className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-deep"><Eye size={17} /> View an example report</Link>
          <Link href="/how-it-works" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-6 py-3 font-semibold transition hover:border-ink-mute">How it works <ArrowRight size={17} /></Link>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-mute"><ShieldCheck size={15} className="text-good" /> No invented “lost revenue” numbers. No AI guesses presented as facts.</p>
      </div>

      {/* Sample report preview — clearly labelled */}
      <div className="mt-14 overflow-hidden rounded-3xl border border-line bg-white shadow-[0_8px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-warn-soft px-5 py-3">
          <span className="rounded-full bg-warn px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">Sample data</span>
          <p className="text-sm font-medium text-ink-soft">Fictional site <code className="font-mono text-xs">{SAMPLE_SITE.url}</code> — shown to demonstrate the report format. The live scanner arrives in Phase 2.</p>
        </div>
        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-center">
          <div className="text-center"><ScoreRing score={auditScore(SAMPLE_FINDINGS)} />
            <p className="mx-auto mt-3 max-w-[180px] text-xs leading-relaxed text-ink-mute">Deterministic score: 100 minus severity deductions. <Link href="/example-report#score" className="font-semibold text-accent hover:underline">See the formula</Link></p></div>
          <ul className="space-y-3">{top.map(f => (<li key={f.ruleId} className="flex items-start gap-3 rounded-xl border border-line p-4">
            <SeverityBadge s={f.severity} />
            <div className="min-w-0"><p className="font-medium leading-snug">{f.title}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-mute">{f.evidence[0]}</p></div></li>))}
            <li><Link href="/example-report" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">Open the full sample report ({SAMPLE_FINDINGS.length} findings) <ArrowRight size={15} /></Link></li></ul>
        </div>
      </div>
    </section>

    <section className="border-y border-line bg-white"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
      {PILLARS.map(({ Icon, t, d }) => (<div key={t}><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep"><Icon size={20} /></span>
        <h2 className="mt-4 text-lg font-semibold">{t}</h2><p className="mt-2 leading-relaxed text-ink-soft">{d}</p></div>))}
    </div></section>

    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center">
      <div><h2 className="text-3xl font-bold tracking-tight">Built for people who audit other people&apos;s websites</h2>
        <p className="mt-4 leading-relaxed text-ink-soft">Freelancers, small web agencies, and SEO consultants: stop manually clicking through every page before a client call. Clyvro runs a bounded, repeatable check-set and produces a report you can defend line by line.</p>
        <ul className="mt-6 space-y-2.5">{CHECKS.map(c => <li key={c} className="flex items-center gap-2.5 text-sm font-medium"><Gauge size={16} className="shrink-0 text-accent" />{c}</li>)}</ul></div>
      <div className="rounded-3xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <h3 className="font-semibold">What Clyvro will never do</h3>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
          <li>✕ &nbsp;Claim a public scan can calculate your client&apos;s exact lost revenue.</li>
          <li>✕ &nbsp;Present an AI opinion as an observed fact.</li>
          <li>✕ &nbsp;Invent testimonials, logos, or conversion statistics. (There are none on this page — deliberately.)</li>
          <li>✓ &nbsp;<span className="text-ink">Show the observation, the rule, the confidence basis, and the fix — every time.</span></li>
        </ul></div>
    </section>

    <section id="waitlist" className="border-t border-line bg-white"><div className="mx-auto max-w-3xl px-5 py-16">
      <h2 className="text-3xl font-bold tracking-tight">Join the pilot waitlist</h2>
      <p className="mt-3 leading-relaxed text-ink-soft">The scanner (Phase 2) and saved audit product (Phase 3) are in active development. Pilot users will be agencies and freelancers willing to review real reports and tell us what&apos;s wrong with them.</p>
      <div className="mt-6"><WaitlistForm /></div></div></section>
  </>);
}
