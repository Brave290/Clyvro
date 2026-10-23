import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MousePointerClick, Ruler, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import Reveal from "@/components/Reveal";
import SampleFlowDemo from "@/components/SampleFlowDemo";
import AuthCta from "@/components/AuthCta";

export const metadata: Metadata = {
  title: "We watch your site like a customer does — live",
  description:
    "Clyvro opens your website on a real phone and computer, walks through it like a visitor, and shows you what's confusing, hidden, or broken — live, while you watch.",
  alternates: { canonical: "/flow-scan" },
};

const CHECKS = [
  {
    Icon: MousePointerClick,
    t: "We walk through it like a customer",
    d: "We open your site on a real phone screen, tap menus, follow links, scroll — just like a customer shopping or booking. You watch every step happen live, like looking over our shoulder.",
  },
  {
    Icon: Ruler,
    t: "We measure what's actually broken on the screen",
    d: "No 'Book now' button you can see without scrolling? Five different 'Buy' buttons fighting for attention? Tiny buttons you can't tap with a thumb? Text spilling off the phone screen? We measure it on the real screen and tell you how to fix it.",
  },
  {
    Icon: ScanSearch,
    t: "We also check what normal scans miss",
    d: "Some problems only appear after the page finishes loading — like menus that only show after you click. We load the full page first, then run all our checks on what the customer actually sees. If your site had an error while loading, we show you — honestly, not exaggerated.",
  },
  {
    Icon: ShieldCheck,
    t: "Safe — we never buy, delete, or log out",
    d: "We only visit public pages you could visit yourself. We never fill in forms, never click 'Buy', 'Delete' or 'Sign out'. At most 5 pages per run, and we check each page is still your site before we open it.",
  },
];

const ALLOWANCES: [string, string][] = [
  ["Free", "1 run a month — free"],
  ["Starter", "5 runs a month"],
  ["Pro", "25 runs a month"],
  ["Agency", "Unlimited"],
];

export default function FlowScanPublic() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <Reveal>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <MousePointerClick size={14} aria-hidden /> Live browser walk-through · New
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Watch a real phone use your website — and catch what you're losing.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          A normal check reads your code. This one <strong className="text-ink">visits</strong> — on a real phone screen,
          tapping what customers tap, opening what they open. You'll see live, step-by-step, where people get stuck, confused, or leave.
          Before they do it for real — and you lose the sale.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <AuthCta
            guestHref="/sign-up"
            guest={<>Watch my site free <ArrowRight size={15} aria-hidden /></>}
            signedHref="/app/flow-scan"
            signed={<>Open walk-through <ArrowRight size={15} aria-hidden /></>}
            className="button-primary"
          />
          <Link href="/pricing" className="button-secondary">See plans</Link>
        </div>
      </Reveal>

      <Reveal className="mt-10">
        <SampleFlowDemo />
      </Reveal>

      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {CHECKS.map(({ Icon, t, d }, i) => (
          <Reveal key={t} delay={i * 80}>
            <div className="group h-full rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:border-accent/40 hover:shadow-md">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white">
                <Icon size={20} aria-hidden />
              </span>
              <h2 className="mt-4 font-semibold">{t}</h2>
              <p className="mt-1.5 leading-relaxed text-ink-soft">{d}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-14">
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Sparkles size={19} className="text-accent" aria-hidden /> Try it free — on your real site
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">
            This uses a real phone in the cloud, so we limit how many times you can run it per month — but everyone gets a free taste.
            See it catch a problem on your own site, then decide if you want more.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ALLOWANCES.map(([plan, runs]) => (
              <li key={plan} className="rounded-xl bg-canvas px-4 py-3">
                <span className="block text-xs font-bold uppercase tracking-wide text-ink-mute">{plan}</span>
                <span className="mt-0.5 block font-semibold">{runs}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <AuthCta
              guestHref="/sign-up"
              guest={<>Start free <ArrowRight size={15} aria-hidden /></>}
              signedHref="/app/flow-scan"
              signed={<>Open walk-through <ArrowRight size={15} aria-hidden /></>}
              className="button-primary"
            />
            <Link href="/app/flow-scan" className="button-secondary">Open walk-through</Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-mute">
            Your report shows every step we took, what we saw on the screen, and a simple "fix it like this" list you can paste to your web person — or your AI helper like ChatGPT.
            If we cancelled a background load (nothing to worry about), we say so honestly — never counted as an error.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
