import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSearch, ShieldCheck, Gauge, ListChecks, FlaskConical } from "lucide-react";
import WaitlistForm from "@/components/WaitlistForm";
import Reveal from "@/components/Reveal";
import HeroScanForm from "@/components/HeroScanForm";
import PublicStats from "@/components/PublicStats";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const PILLARS = [
  { Icon: FileSearch, t: "Proof, not opinions", d: "Every problem we flag comes with what we actually saw on the page. If we can't show it, we don't claim it." },
  { Icon: FlaskConical, t: "Honest about guesswork", d: "Some checks are facts (a broken link is a broken link). Some are educated guesses. We always tell you which is which." },
  { Icon: ListChecks, t: "A plan, not a pile of warnings", d: "Issues are sorted by how serious they are, with a plain-English fix for each — ready to hand to a client or work through yourself." },
];
const CHECKS = ["Broken links & forms that go nowhere — each link actually requested; forms are never submitted", "Missing page titles & descriptions", "Pages with no clear next step for visitors", "Images & form fields missing labels", "Personal details sent without encryption", "Mobile & language basics", "Duplicate IDs, broken ARIA references, links with no text & missing security.txt/llms.txt (ruleset v5.1)", "Weakened Content-Security-Policy & exposed sensitive files like /.env (ruleset v5.2, deep scans)"];
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Clyvro",
  url: "https://clyvro.vercel.app",
  description:
    "Evidence-first website audits: real bounded scans with verifiable findings for agencies, freelancers, developers and consultants.",
};

export default function Home() {
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }} />
    <CookieConsentBanner />
    <section className="relative overflow-hidden">
      {/* soft brand glow (decorative) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(640px_320px_at_18%_-6%,rgba(37,99,235,0.13),transparent_65%),radial-gradient(520px_260px_at_92%_8%,rgba(37,99,235,0.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn-soft px-3 py-1.5 text-xs font-semibold text-warn" role="status">
            <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />
            Clyvro is in beta — the core scanner is live, some tools are still being built, and beta testers steer what ships next.
          </p>
          <h1 className="animate-fade-up mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Find the friction.<br /><span className="text-accent">Fix the conversion.</span></h1>
          <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">Clyvro checks websites for the problems that quietly cost you customers — broken links, missing information, forms that lead nowhere — and shows you exactly what it found, so nobody has to ask <em>“how do you know?”</em> <strong className="text-ink">Built your product with an AI coding tool?</strong> Run it through Clyvro before it goes to production — and catch what the AI missed while fixing it is still cheap.</p>

          <div style={{ animationDelay: "180ms" }} className="animate-fade-up mt-8 max-w-2xl">
            <HeroScanForm />
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-good" aria-hidden /> Your first scan is free — no account needed</span>
              <span>10 free scans every month</span>
              <span><Link href="/pricing" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Paid plans from $19/month</Link></span>
              <span>Only scan sites you own or have permission to check</span>
              <Link href="/how-it-works" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">How it works</Link>
            </p>
          </div>
        </div>

        <Reveal className="mt-12">
          <PublicStats />
        </Reveal>
      </div>
    </section>

    <section className="border-y border-line bg-surface"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
      {PILLARS.map(({ Icon, t, d }, i) => (<Reveal key={t} delay={i * 120}><div className="group"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white"><Icon size={20} aria-hidden /></span>
        <h2 className="mt-4 text-lg font-semibold">{t}</h2><p className="mt-2 leading-relaxed text-ink-soft">{d}</p></div></Reveal>))}
    </div></section>

    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center">
      <Reveal><div><h2 className="text-3xl font-bold tracking-tight">Made for people who look after other people&apos;s websites</h2>
        <p className="mt-4 leading-relaxed text-ink-soft">Agencies, freelancers, and consultants: stop clicking through every page by hand before a client call. Add your clients, check their sites in minutes, invite your team, and send clients a clean report link they can actually understand. Under the hood it is one deterministic engine: 47 checks (ruleset v5.2), and every finding carries its rule ID, the exact evidence observed, and the fix. Clyvro is a product of Founda Technologies, founded in 2026, and the public <Link href="/changelog" className="font-semibold text-accent hover:underline">What&apos;s new</Link> page shows what shipped and when. You can reach the founder directly at <a href="mailto:admin.founda@gmail.com" className="font-semibold text-accent hover:underline">admin.founda@gmail.com</a>.</p>
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
        <p className="mt-3 leading-relaxed text-ink-soft">Accounts are live: <a href="/sign-up" className="font-semibold text-accent hover:underline">create a free account</a> to organize clients, save every check, see what changed between visits, and share reports your clients will actually read. <strong className="text-ink">Clyvro Dev</strong> is the early-access list for what&apos;s coming next — deeper checks, scheduled monitoring, and paid plans — with a direct line to the roadmap: every signup is emailed straight to the founder&apos;s inbox — no support queue, no ticket number.</p>
        <div className="mt-6"><WaitlistForm /></div>
      </Reveal></div></section>
  </>);
}
