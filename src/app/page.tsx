import Link from "next/link";
import { ArrowRight, FileSearch, ShieldCheck, Gauge, ListChecks, FlaskConical } from "lucide-react";
import WaitlistForm from "@/components/WaitlistForm";
import Reveal from "@/components/Reveal";
import HeroScanForm from "@/components/HeroScanForm";

const PILLARS = [
  { Icon: FileSearch, t: "Proof, not opinions", d: "Every problem we flag comes with what we actually saw on the page. If we can't show it, we don't claim it." },
  { Icon: FlaskConical, t: "Honest about guesswork", d: "Some checks are facts (a broken link is a broken link). Some are educated guesses. We always tell you which is which." },
  { Icon: ListChecks, t: "A plan, not a pile of warnings", d: "Issues are sorted by how serious they are, with a plain-English fix for each — ready to hand to a client or work through yourself." },
];
const CHECKS = ["Broken links & forms that go nowhere", "Missing page titles & descriptions", "Pages with no clear next step for visitors", "Images & form fields missing labels", "Personal details sent without encryption", "Mobile & language basics"];
const SCAN_FACTS = [
  ["12", "things checked on every page"],
  ["≤10", "pages read in full"],
  ["≤25", "links & forms tested"],
  ["0", "forms ever submitted"],
];

export default function Home() {
  return (<>
    <section className="relative overflow-hidden">
      {/* soft brand glow (decorative) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(640px_320px_at_18%_-6%,rgba(37,99,235,0.13),transparent_65%),radial-gradient(520px_260px_at_92%_8%,rgba(37,99,235,0.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <h1 className="animate-fade-up text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Find the friction.<br /><span className="text-accent">Fix the conversion.</span></h1>
          <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">Clyvro checks websites for the problems that quietly cost you customers — broken links, missing information, forms that lead nowhere — and shows you exactly what it found, so nobody has to ask <em>“how do you know?”</em></p>

          <div style={{ animationDelay: "180ms" }} className="animate-fade-up mt-8 max-w-2xl">
            <HeroScanForm />
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-good" aria-hidden /> Your first scan is free — no account needed</span>
              <span>Only scan sites you own or have permission to check</span>
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
          <p className="mt-3 text-center text-xs text-ink-mute">Just facts about how the checker works — and every report tells you exactly what was and wasn&apos;t checked.</p>
        </Reveal>
      </div>
    </section>

    <section className="border-y border-line bg-surface"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
      {PILLARS.map(({ Icon, t, d }, i) => (<Reveal key={t} delay={i * 120}><div className="group"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white"><Icon size={20} aria-hidden /></span>
        <h2 className="mt-4 text-lg font-semibold">{t}</h2><p className="mt-2 leading-relaxed text-ink-soft">{d}</p></div></Reveal>))}
    </div></section>

    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center">
      <Reveal><div><h2 className="text-3xl font-bold tracking-tight">Made for people who look after other people&apos;s websites</h2>
        <p className="mt-4 leading-relaxed text-ink-soft">Agencies, freelancers, and consultants: stop clicking through every page by hand before a client call. Add your clients, check their sites in minutes, invite your team, and send clients a clean report link they can actually understand.</p>
        <ul className="mt-6 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{CHECKS.map(c => <li key={c} className="flex items-start gap-2.5 text-sm font-medium"><Gauge size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />{c}</li>)}</ul>
        <Link href="/scan" className="mt-7 inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">Try it on a live site <ArrowRight size={16} aria-hidden /></Link>
      </div></Reveal>
      <Reveal delay={140}><div className="rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:shadow-[0_8px_30px_rgba(2,6,23,0.08)]">
        <h3 className="font-semibold">What Clyvro will never do</h3>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
          <li>✕ &nbsp;Pretend a quick scan can calculate exactly how much money a website is losing.</li>
          <li>✕ &nbsp;Pass off a guess as a proven fact.</li>
          <li>✕ &nbsp;Invent testimonials, logos, or success statistics. (There are none on this page — on purpose.)</li>
          <li>✓ &nbsp;<span className="text-ink">Show what we found, how sure we are, and how to fix it — every time.</span></li>
        </ul></div></Reveal>
    </section>

    <section id="waitlist" className="scroll-mt-20 border-t border-line bg-surface"><div className="mx-auto max-w-3xl px-5 py-16">
      <Reveal>
        <h2 className="text-3xl font-bold tracking-tight">Join Clyvro Dev</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">Accounts are live: <a href="/sign-up" className="font-semibold text-accent hover:underline">create a free account</a> to organize clients, save every check, see what changed between visits, and share reports your clients will actually read. <strong className="text-ink">Clyvro Dev</strong> is the early-access list for what&apos;s coming next — deeper checks, scheduled monitoring, and paid plans — with a direct line to the roadmap.</p>
        <div className="mt-6"><WaitlistForm /></div>
      </Reveal></div></section>
  </>);
}
