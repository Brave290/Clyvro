import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MousePointerClick, Ruler, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import Reveal from "@/components/Reveal";
import SampleFlowDemo from "@/components/SampleFlowDemo";

export const metadata: Metadata = {
  title: "Flow Scan — watch a real browser walk your website",
  description:
    "Clyvro Flow Scan renders your site in a real browser, watches it like a visitor, measures UI flaws (missing CTA, tiny tap targets, overflow), runs the full scanner + AI-pattern detector on the rendered page, and streams every step live.",
  alternates: { canonical: "/flow-scan" },
};

const CHECKS = [
  {
    Icon: MousePointerClick,
    t: "It browses like a visitor",
    d: "JavaScript on, pages rendered for real. It opens menus, follows your links, checks the phone layout at 390px — and streams every step live while it works, like watching an agent drive a browser.",
  },
  {
    Icon: Ruler,
    t: "UI flaws, measured — not opinions",
    d: "No call-to-action in the first screenful, five competing CTAs, tap targets smaller than 24px, content wider than the screen, buttons with no label. Each flaw comes from the rendered page's actual geometry, with the fix written out.",
  },
  {
    Icon: ScanSearch,
    t: "Every scanner, fed the rendered page",
    d: "The full ruleset and the AI-pattern detector also run on the DOM after JavaScript — so client-rendered problems the raw-HTML scan can't see are caught too. Console errors and genuinely failed requests are recorded; cancelled prefetches are honestly labelled, never counted as failures.",
  },
  {
    Icon: ShieldCheck,
    t: "Safe by construction",
    d: "Public sites only (every navigation re-checked), forms are never submitted, and checkout, delete and sign-out actions are never clicked. At most 5 pages per run.",
  },
];

const ALLOWANCES: [string, string][] = [
  ["Freemium", "1 run / month — free"],
  ["Basic", "5 runs / month"],
  ["Pro", "25 runs / month"],
  ["Ultra Agency", "Unlimited"],
];

export default function FlowScanPublic() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <Reveal>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <MousePointerClick size={14} aria-hidden /> Flow Scan · New
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Watch a real browser walk your website — and write down everything wrong with the journey.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          A normal scan reads your HTML. Flow Scan <strong className="text-ink">visits</strong> — rendering pages the way
          visitors get them, probing menus, checking the phone layout, and measuring where your call-to-action actually
          sits. Every step streams live, in a browser window you watch.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/sign-up" className="button-primary">
            Run yours free <ArrowRight size={15} aria-hidden />
          </Link>
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
            <Sparkles size={19} className="text-accent" aria-hidden /> Every plan can try it
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">
            Flow Scan runs a real browser per scan, so runs are capped per plan — but nobody is locked out.
            Test it free, watch it work on your own site, then decide.
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
            <Link href="/sign-up" className="button-primary">Start free <ArrowRight size={15} aria-hidden /></Link>
            <Link href="/app/flow-scan" className="button-secondary">Open Flow Scan</Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-mute">
            Reports include the full step log, rendered-page findings with rule IDs, and a ready-to-paste fix brief for
            your AI coding agent (Cursor, Claude, ChatGPT…). Cancelled route prefetches are reported as cancelled — never dressed up as failures.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
