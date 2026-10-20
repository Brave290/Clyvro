import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Radar, FileSearch, ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
import Reveal from "@/components/Reveal";
export const metadata: Metadata = { title: "How it works" };
const STEPS = [
  { Icon: Link2, t: "1. Submit a public URL", d: "Paste a website address. Clyvro validates it, rejects private/internal destinations, and runs a bounded scan — the page itself plus a limited set of same-site pages.", phase: "Live · Phase 2" },
  { Icon: Radar, t: "2. Bounded, safe crawling", d: "HTTP-first crawling with strict limits on pages, depth, redirects, response size, and time. A browser is only launched when a check needs rendered layout or a screenshot.", phase: "Live · Phase 2" },
  { Icon: FileSearch, t: "3. Deterministic checks run", d: "A versioned ruleset inspects what was actually observed: response codes, page markup, and form structure. Each rule records its evidence. (Lab performance measurement joins in a later iteration.)", phase: "Live · Phase 2" },
  { Icon: ListChecks, t: "4. Findings, prioritised", d: "You get findings with severity, a stated confidence basis (confirmed / measured / heuristic), the evidence, a recommended fix, and an effort estimate. Signed-in audits are saved, comparable between runs, and shareable via revocable links.", phase: "Phase 2–3" },
  { Icon: RotateCcw, t: "5. Fix, then verify", d: "Re-scan after changes and see which findings are resolved, which remain, and what changed since the last audit.", phase: "Phase 5" },
];
export default function HowItWorks() {
  return (<div className="mx-auto max-w-4xl px-5 py-14">
    <h1 className="animate-fade-up text-4xl font-bold tracking-tight">How Clyvro works</h1>
    <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-4 text-lg leading-relaxed text-ink-soft">An evidence-first audit in five steps. We&apos;re building in public phases, so each step below is labelled with the phase it arrives in — no pretending the finished product already exists.</p>
    <ol className="mt-10 space-y-4">{STEPS.map(({ Icon, t, d, phase }, i) => (
      <Reveal key={t} delay={i * 90}>
        <li className="group flex gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white"><Icon size={20} /></span>
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t}</h2><span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">{phase}</span></div>
          <p className="mt-1.5 leading-relaxed text-ink-soft">{d}</p></div></li>
      </Reveal>))}</ol>
    <Reveal className="mt-8">
      <div className="flex items-start gap-3 rounded-2xl border border-good/25 bg-good-soft p-6">
        <ShieldCheck className="mt-0.5 shrink-0 text-good" size={20} />
        <p className="text-sm leading-relaxed"><strong>Safety by design.</strong> Submitted URLs are untrusted input. The scanner blocks requests to private networks and cloud metadata endpoints, pins connections to validated IP addresses, re-validates every redirect, and never forwards your cookies or credentials to scanned sites. <Link href="/scan" className="font-semibold text-accent-deep hover:underline">Run a scan</Link> to see the evidence standard every finding must meet.</p></div>
    </Reveal>
  </div>);
}
