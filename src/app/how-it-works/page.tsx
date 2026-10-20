import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Radar, FileSearch, ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
import Reveal from "@/components/Reveal";
export const metadata: Metadata = { title: "How it works" };
const STEPS = [
  { Icon: Link2, t: "1. Paste a website address", d: "That's all we need to start. We check the address is a normal public website — for safety, we refuse private or internal addresses outright.", phase: "Live now" },
  { Icon: Radar, t: "2. We visit like a careful customer", d: "We open the page and follow links around the same website (up to 10 pages for signed-in checks on the free plan, more on higher plans). We never fill in forms or send anything to the site.", phase: "Live now" },
  { Icon: FileSearch, t: "3. We check the things that matter", d: "Broken links, forms that lead nowhere, missing titles, images without descriptions, pages that break on phones, personal details asked for without encryption — each check keeps a note of exactly what it saw.", phase: "Live now" },
  { Icon: ListChecks, t: "4. You get a clear to-do list", d: "Problems are sorted by how serious they are, each with the proof, a plain-English fix, and a rough idea of the effort involved. Save reports, share them with clients by link, and compare them next time.", phase: "Live now" },
  { Icon: RotateCcw, t: "5. Fix it, then check again", d: "Run a fresh check after making changes and see what's fixed, what's still open, and what new has appeared. Or put it on a schedule — Clyvro re-checks on cadence and emails you when something changes.", phase: "Live now" },
];
export default function HowItWorks() {
  return (<div className="mx-auto max-w-4xl px-5 py-14">
    <h1 className="animate-fade-up text-4xl font-bold tracking-tight">How Clyvro works</h1>
    <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-4 text-lg leading-relaxed text-ink-soft">Five simple steps, no jargon. Every step below is live today.</p>
    <ol className="mt-10 space-y-4">{STEPS.map(({ Icon, t, d, phase }, i) => (
      <Reveal key={t} delay={i * 90}>
        <li className="group flex gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:border-accent/40 hover:shadow-md">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white"><Icon size={20} /></span>
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t}</h2><span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">{phase}</span></div>
          <p className="mt-1.5 leading-relaxed text-ink-soft">{d}</p></div></li>
      </Reveal>))}</ol>
    <Reveal className="mt-8">
      <div className="flex items-start gap-3 rounded-2xl border border-good/25 bg-good-soft p-6">
        <ShieldCheck className="mt-0.5 shrink-0 text-good" size={20} />
        <p className="text-sm leading-relaxed"><strong>Safe by design.</strong> Every address people type in is treated carefully: we only ever connect to normal public websites, we double-check every redirect, and we never send your information to the sites being checked. <Link href="/scan" className="font-semibold text-accent-deep hover:underline">Try a free check</Link> and see the standard of proof behind every result.</p></div>
    </Reveal>
  </div>);
}
