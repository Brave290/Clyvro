import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Radar, FileSearch, ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
export const metadata: Metadata = { title: "How it works" };
const STEPS = [
  { Icon: Link2, t: "1. Submit a public URL", d: "Paste a website address. Clyvro validates it, rejects private/internal destinations, and queues a bounded scan — the page itself plus a limited set of same-site pages.", phase: "Phase 2" },
  { Icon: Radar, t: "2. Bounded, safe crawling", d: "HTTP-first crawling with strict limits on pages, depth, redirects, response size, and time. A browser is only launched when a check needs rendered layout or a screenshot.", phase: "Phase 2" },
  { Icon: FileSearch, t: "3. Deterministic checks run", d: "A versioned ruleset inspects what was actually observed: response codes, page markup, form structure, and lab performance measurements. Each rule records its evidence.", phase: "Phase 2" },
  { Icon: ListChecks, t: "4. Findings, prioritised", d: "You get findings with severity, a stated confidence basis (confirmed / measured / heuristic), the evidence, a recommended fix, and an effort estimate — in a report you can share.", phase: "Phase 3" },
  { Icon: RotateCcw, t: "5. Fix, then verify", d: "Re-scan after changes and see which findings are resolved, which remain, and what changed since the last audit.", phase: "Phase 5" },
];
export default function HowItWorks() {
  return (<div className="mx-auto max-w-4xl px-5 py-14">
    <h1 className="text-4xl font-bold tracking-tight">How Clyvro works</h1>
    <p className="mt-4 text-lg leading-relaxed text-ink-soft">An evidence-first audit in five steps. We&apos;re building in public phases, so each step below is labelled with the phase it arrives in — no pretending the finished product already exists.</p>
    <ol className="mt-10 space-y-4">{STEPS.map(({ Icon, t, d, phase }) => (
      <li key={t} className="flex gap-4 rounded-2xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep"><Icon size={20} /></span>
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t}</h2><span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">{phase}</span></div>
        <p className="mt-1.5 leading-relaxed text-ink-soft">{d}</p></div></li>))}</ol>
    <div className="mt-8 flex items-start gap-3 rounded-2xl border border-good/25 bg-good-soft p-6">
      <ShieldCheck className="mt-0.5 shrink-0 text-good" size={20} />
      <p className="text-sm leading-relaxed"><strong>Safety by design.</strong> Submitted URLs are untrusted input. The scanner will run isolated from the application, block requests to private networks and cloud metadata endpoints, re-validate every redirect, and never forward your cookies or credentials to scanned sites. See the <Link href="/example-report" className="font-semibold text-accent-deep hover:underline">sample report</Link> for the evidence standard every finding must meet.</p></div>
  </div>);
}
