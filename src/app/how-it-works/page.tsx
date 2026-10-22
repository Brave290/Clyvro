import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Radar, FileSearch, ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
import Reveal from "@/components/Reveal";
export const metadata: Metadata = {
  title: "How it works — no tech talk",
  description: "How Clyvro checks your website: you paste a link, we visit like a customer, and tell you in plain English what's broken and how to fix it.",
  alternates: { canonical: "/how-it-works" },
};
const STEPS = [
  { Icon: Link2, t: "1. Paste your website address", d: "Just copy your link — like mamas-cakes.com — and hit Check. We only visit normal public websites. If it's a private office address, we say no (to keep everyone safe).", phase: "Live today" },
  { Icon: Radar, t: "2. We visit like a real customer", d: "We open your homepage and click around — same way a customer would. We try every menu, every link, on up to 10 pages (more if you have a paid plan). We never fill in forms or buy anything — we just look.", phase: "Live today" },
  { Icon: FileSearch, t: "3. We write down everything that's wrong", d: "Broken links that go to 'page not found', forms that lead nowhere, pages Google can't read, buttons that don't work on phones, photos with no description for blind visitors — each problem comes with the exact page we saw it on.", phase: "Live today" },
  { Icon: ListChecks, t: "4. You get a simple to-do list", d: "No scary tech report. You get: what's broken, how badly it hurts your sales, a photo/proof, and 'fix it like this' in words your web person can do in minutes. Save it, share the link with your team or client.", phase: "Live today" },
  { Icon: RotateCcw, t: "5. Fix it, then check again to prove it", d: "After you fix a link, run another check. Clyvro will say 'Fixed ✓' — proof the job is done. Put it on auto-pilot and we'll re-check every week and email you if something new breaks.", phase: "Live today" },
];
export default function HowItWorks() {
  return (<div className="mx-auto max-w-4xl px-5 py-14">
    <h1 className="animate-fade-up text-4xl font-bold tracking-tight">How it works — no tech degree needed</h1>
    <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-4 text-lg leading-relaxed text-ink-soft">Five steps. Plain English. Every step below works right now.</p>
    <ol className="mt-10 space-y-4">{STEPS.map(({ Icon, t, d, phase }, i) => (
      <Reveal key={t} delay={i * 90}>
        <li className="group flex gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:border-accent/40 hover:shadow-md">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white"><Icon size={20} /></span>
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t}</h2><span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">{phase}</span></div>
          <p className="mt-1.5 leading-relaxed text-ink-soft">{d}</p></div></li>
      </Reveal>))}</ol>
    <Reveal className="mt-8">
      <div className="rounded-2xl border border-line bg-canvas p-6">
        <h2 className="font-semibold">Real example: what Clyvro found in 2 minutes</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>"Contact us" button on your homepage → goes to a page that doesn't exist (we tried it, got '404'). <strong className="text-ink">Fix:</strong> change the link to /contact</li>
          <li>Your best-selling product photo has no description — blind customers hear "image" and nothing else. <strong className="text-ink">Fix:</strong> add alt text: "Red velvet cake, 8 inch, Lagos delivery"</li>
          <li>Your site on a small phone: "Order on WhatsApp" button is cut off — people can't tap it. <strong className="text-ink">Fix:</strong> make the button wider, move it up</li>
        </ul>
        <p className="mt-3 text-sm text-ink-soft">That's the level of detail you get. No guessing. <Link href="/scan" className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline">Try it on your site →</Link> Or watch a <Link href="/flow-scan" className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline">live walk-through</Link> of how a real browser checks a page.</p>
      </div>
    </Reveal>
    <Reveal className="mt-6">
      <div className="flex items-start gap-3 rounded-2xl border border-good/25 bg-good-soft p-6">
        <ShieldCheck className="mt-0.5 shrink-0 text-good" size={20} />
        <p className="text-sm leading-relaxed"><strong>Safe by design.</strong> We only visit public websites, we never submit forms or log into anything, and we check every link twice before we say it's broken. <Link href="/scan" className="inline-flex min-h-8 items-center font-semibold text-accent-deep hover:underline">Run a free check</Link> and see for yourself.</p></div>
    </Reveal>
  </div>);
}
