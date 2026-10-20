import Link from "next/link";
import { ArrowRight, FileSearch, ShieldCheck, Gauge, ListChecks, FlaskConical } from "lucide-react";
import WaitlistForm from "@/components/WaitlistForm";
import Reveal from "@/components/Reveal";
import HeroScanForm from "@/components/HeroScanForm";

const PILLARS = [
  { Icon: FileSearch, t: "Evidence, not opinions", d: "Every finding carries a rule ID, the exact observation behind it, and how it was detected. If we can't show it, we don't claim it." },
  { Icon: FlaskConical, t: "Honest about uncertainty", d: "Confirmed failures, measurements, and heuristics are labelled differently — because they are different. No heuristic is dressed up as proof." },
  { Icon: ListChecks, t: "Prioritised for client work", d: "Findings are ranked by severity with an estimated fix effort, so you can hand a client a plan instead of a pile of warnings." },
];
const CHECKS = ["Broken forms & dead-end links", "Missing titles & meta descriptions", "Missing call-to-action signals", "Image alt text & form labels", "Sensitive forms over plain HTTP", "Viewport, language & heading basics"];
const SCAN_FACTS = [
  ["12", "deterministic rules"],
  ["≤10", "pages read in full"],
  ["≤25", "links & forms verified"],
  ["0", "forms ever submitted"],
];

export default function Home() {
  return (<>
    <section className="relative overflow-hidden">
      {/* soft brand glow (decorative) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(640px_320px_at_18%_-6%,rgba(37,99,235,0.13),transparent_65%),radial-gradient(520px_260px_at_92%_8%,rgba(37,99,235,0.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft"><span className="animate-pulse-dot h-2 w-2 rounded-full bg-good" /> Live scanner — real findings in under a minute</p>
          <h1 style={{ animationDelay: "90ms" }} className="animate-fade-up mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Find the friction.<br /><span className="text-accent">Fix the conversion.</span></h1>
          <p style={{ animationDelay: "180ms" }} className="animate-fade-up mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">Clyvro audits client websites for verifiable technical, usability, and conversion issues — then shows the evidence behind every finding, so your recommendations survive a client asking <em>“how do you know?”</em></p>

          <div style={{ animationDelay: "270ms" }} className="animate-fade-up mt-8 max-w-2xl">
            <HeroScanForm />
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-good" aria-hidden /> No account needed</span>
              <span>Only scan sites you own or are authorized to assess</span>
              <Link href="/how-it-works" className="font-semibold text-accent hover:underline">How it works</Link>
            </p>
          </div>
        </div>

        <Reveal className="mt-12">
          <dl className="grid grid-cols-2 overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_8px_36px_rgba(2,6,23,0.05)] lg:grid-cols-4">
            {SCAN_FACTS.map(([n, label], i) => (
              <div key={label} className={`px-6 py-6 text-center ${i % 2 === 1 ? "border-l border-line" : ""} ${i > 1 ? "border-t border-line lg:border-t-0" : ""} ${i > 0 ? "lg:border-l" : ""}`}>
                <dd className="text-3xl font-bold tracking-tight text-accent">{n}</dd>
                <dt className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-mute">{label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-center text-xs text-ink-mute">Product facts about how the scanner works — not marketing statistics. Every scan shows exactly what was and wasn&apos;t checked.</p>
        </Reveal>
      </div>
    </section>

    <section className="border-y border-line bg-surface"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
      {PILLARS.map(({ Icon, t, d }, i) => (<Reveal key={t} delay={i * 120}><div className="group"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:-translate-y-1 group-hover:bg-accent group-hover:text-white"><Icon size={20} aria-hidden /></span>
        <h2 className="mt-4 text-lg font-semibold">{t}</h2><p className="mt-2 leading-relaxed text-ink-soft">{d}</p></div></Reveal>))}
    </div></section>

    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center">
      <Reveal><div><h2 className="text-3xl font-bold tracking-tight">Built for people who audit other people&apos;s websites</h2>
        <p className="mt-4 leading-relaxed text-ink-soft">Freelancers, small web agencies, developers, and SEO consultants: stop manually clicking through every page before a client call. Clyvro runs a bounded, repeatable check-set and produces findings you can defend line by line.</p>
        <ul className="mt-6 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{CHECKS.map(c => <li key={c} className="flex items-start gap-2.5 text-sm font-medium"><Gauge size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />{c}</li>)}</ul>
        <Link href="/scan" className="group mt-7 inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">Try it on a live site <ArrowRight size={16} className="transition duration-200 group-hover:translate-x-1" aria-hidden /></Link>
      </div></Reveal>
      <Reveal delay={140}><div className="rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:shadow-[0_8px_30px_rgba(2,6,23,0.08)]">
        <h3 className="font-semibold">What Clyvro will never do</h3>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
          <li>✕ &nbsp;Claim a public scan can calculate your client&apos;s exact lost revenue.</li>
          <li>✕ &nbsp;Present an AI opinion as an observed fact.</li>
          <li>✕ &nbsp;Invent testimonials, logos, or conversion statistics. (There are none on this page — deliberately.)</li>
          <li>✓ &nbsp;<span className="text-ink">Show the observation, the rule, the confidence basis, and the fix — every time.</span></li>
        </ul></div></Reveal>
    </section>

    <section id="waitlist" className="scroll-mt-20 border-t border-line bg-surface"><div className="mx-auto max-w-3xl px-5 py-16">
      <Reveal>
        <h2 className="text-3xl font-bold tracking-tight">Join Clyvro Dev</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">Accounts are live: <a href="/sign-up" className="font-semibold text-accent hover:underline">create a free account</a> to save projects, keep audit history, compare re-scans, and share reports with clients. <strong className="text-ink">Clyvro Dev</strong> is the early-access list for what&apos;s next — browser-grade audits, monitoring, and paid-plan launches — with a direct line to shape the roadmap.</p>
        <div className="mt-6"><WaitlistForm /></div>
      </Reveal></div></section>
  </>);
}
