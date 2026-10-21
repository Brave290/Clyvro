import type { Metadata } from "next";
import Link from "next/link";
import { Check, Info, Minus } from "lucide-react";
import Reveal from "@/components/Reveal";
import { PLANS, type Plan } from "@/lib/plans";
import { LocalizedPrice, PricingCurrencyProvider } from "@/components/PricingCurrency";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Clyvro plans from free to Ultra Agency: real website scans, saved history, deep scans and team workspaces. Prices in your region, no surprises.",
  alternates: { canonical: "/pricing" },
};

const PLAIN_TYPE_NAMES: Record<string, string> = {
  "generic": "Full check",
  "technical-seo": "Search visibility",
  "accessibility": "Easy for everyone to use",
  "conversion-ux": "Turning visitors into enquiries",
  "security-config": "Basic safety setup",
};

function toolHackSeoLabel(p: Plan): boolean | string {
  const rule = p.tools.hackSeo;
  if (!rule) return true; // unlimited (rendered as a check with the row text below)
  return rule.period === "lifetime" ? `${rule.count} free runs (starter taste)` : `${rule.count} runs/month`;
}
function toolDevLabel(p: Plan): boolean | string {
  const rule = p.tools.devTools;
  if (!rule) return true;
  return rule.period === "lifetime-per-tool" ? `${rule.count} free runs per tool` : `${rule.count} runs/month pooled`;
}

function entitlementRows(p: Plan): [string, boolean | string][] {
  return [
    [`${p.scansPerMonth} website checks per month`, true],
    [`Up to ${p.maxPagesPerScan.toLocaleString()} pages looked at per check`, true],
    [`${p.maxProjects} website${p.maxProjects === 1 ? "" : "s"} tracked`, true],
    [`Kinds of check: ${p.auditTypes.map((t) => PLAIN_TYPE_NAMES[t] ?? t).join(", ")}`, true],
    ["Saved reports, history, and before/after comparisons", true],
    ["Report links you can send to clients (and switch off any time)", true],
    ["Client workspaces and team roles", true],
    [`Team seats: ${p.teamSeats}`, true],
    ["Your own name & colour on shared reports", p.whiteLabel ? true : "Not included"],
    ["Scheduled re-checks (daily/weekly) and email alerts", p.monitoring ? true : "Not included"],
    ["Downloadable reports (PDF, Markdown) & fix-brief export", p.exports],
    ["Deep full-site scans (every page, every link — with recorded ownership consent)", p.deepScans ? true : "Pro and Ultra only"],
    ["Project Readiness (stack, hosting, domain & email profile)", p.readiness === "full" ? "Full super-strict checks" : p.readiness === "basic" ? "Basic checks" : "Free 24-hour trial"],
    ["AI-Pattern & Generic-ness detector (with agent fix prompt)", p.aiDetector ? true : "Pro and Ultra only"],
    ["Rendered flow scanning — a real browser walks the site (Playwright)", p.flowScan ? true : "Pro and Ultra only"],
    [`Your own HTTP cron jobs on Clyvro's scheduler: ${p.maxCronJobs}`, true],
    ["Hack Protection (Beta) security scans", toolHackSeoLabel(p)],
    ["SEO Visibility (New) checks", toolHackSeoLabel(p)],
    ["Developer Tools: SSL, DNS, Redirects, Headers, Robots", toolDevLabel(p)],
  ];
}

export default function Pricing() {
  return (
    <PricingCurrencyProvider>
    <div className="mx-auto max-w-6xl px-5 py-14">
      <h1 className="animate-fade-up text-center text-4xl font-bold tracking-tight">Simple pricing</h1>
      <p style={{ animationDelay: "90ms" }} className="animate-fade-up mx-auto mt-4 max-w-2xl text-center leading-relaxed text-ink-soft">
        Four plans. Prices are shown in your region automatically — we detect where you are,
        no currency picker needed — and checkout charges the fixed price for your region.
        Start free with real limits built in — no card needed. Upgrade any time from
        <strong className="text-ink"> Billing</strong> inside your workspace.
      </p>
      <div style={{ animationDelay: "180ms" }} className="animate-fade-up mx-auto mt-6 flex max-w-2xl items-start gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        Payments are processed by Flutterwave from the Billing page inside your workspace. If checkout
        shows as &quot;not switched on yet&quot;, no charge can happen — we say so plainly there too.
        A check that fails to run never counts against your monthly allowance.
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-ink-mute">
        Every plan can <strong className="text-ink">try the tools free</strong> — real, full runs, so you can see
        they work. <strong className="text-ink">Ultra Agency</strong> removes every counter: unlimited tools, unlimited everything.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p, i) => (
          <Reveal key={p.id} delay={i * 120}>
            <article className={`h-full rounded-3xl border bg-surface p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.09)] ${p.id === "pro" ? "border-accent ring-2 ring-accent/20" : "border-line"}`}>
              {p.id === "pro" && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Core plan</span>
              )}
              <h2 className="mt-3 text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-ink-mute">{p.tagline}</p>
              <p className="mt-5 text-3xl font-bold tracking-tight">
                <LocalizedPrice amountUsd={p.monthlyPriceUsd} />
                <span className="text-base font-medium text-ink-mute">{p.monthlyPriceUsd === 0 ? " forever" : " /month*"}</span>
              </p>
              {p.monthlyPriceUsd > 0 && <p className="mt-1 text-xs text-ink-mute">*Price for your detected region; the exact charge is confirmed at checkout.</p>}
              <ul className="mt-5 space-y-2.5 text-sm">
                {entitlementRows(p).map(([label, state]) => (
                  <li key={label} className="flex gap-2">
                    {state === true ? (
                      <Check size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
                    ) : (
                      <Minus size={16} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />
                    )}
                    <span>
                      {label}
                      {typeof state === "string" && <span className="block text-xs text-ink-mute">{state}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {p.id === "freemium" ? (
                <Link href="/sign-up" className="mt-7 block rounded-lg bg-accent py-2.5 text-center text-sm font-semibold text-white transition duration-200 hover:bg-accent-hover hover:shadow-md">
                  Create free account
                </Link>
              ) : (
                <Link href="/sign-up" className="mt-7 block rounded-lg border border-line py-2.5 text-center text-sm font-semibold transition duration-200 hover:border-accent/50 hover:shadow-sm">
                  Start free, upgrade in-app
                </Link>
              )}
            </article>
          </Reveal>
        ))}
      </div>

      <section aria-label="Full plan comparison" className="mt-12">
        <h2 className="text-center text-2xl font-bold tracking-tight">Compare every plan</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-ink-mute">
          The tools include free starter runs on every plan — full results, so you can see they work before paying.
          Ultra Agency is the only tier with no counters anywhere.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-4 py-3">Feature</th>
                {PLANS.map((p) => <th key={p.id} className="px-4 py-3">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ["Website scans / month", (p: Plan) => `${p.scansPerMonth.toLocaleString()}`],
                ["Pages per scan", (p: Plan) => `Up to ${p.maxPagesPerScan.toLocaleString()}`],
                ["Projects", (p: Plan) => `${p.maxProjects}`],
                ["Deep full-site scans", (p: Plan) => p.deepScans ? "Included (ownership-verified)" : "—"],
                ["Project Readiness", (p: Plan) => p.readiness === "full" ? "Full super-strict" : p.readiness === "basic" ? "Basic checks" : "24-hour trial"],
                ["AI-Pattern Detector", (p: Plan) => p.aiDetector ? "Included" : "—"],
                ["Flow Scan (Playwright)", (p: Plan) => p.flowScan ? "Included" : "—"],
                ["Hack Protection (Beta)", (p: Plan) => p.tools.hackSeo ? (p.tools.hackSeo.period === "lifetime" ? `${p.tools.hackSeo.count} free runs` : `${p.tools.hackSeo.count}/month`) : "Unlimited"],
                ["SEO Visibility (New)", (p: Plan) => p.tools.hackSeo ? (p.tools.hackSeo.period === "lifetime" ? `${p.tools.hackSeo.count} free runs` : `${p.tools.hackSeo.count}/month`) : "Unlimited"],
                ["Developer Tools (5)", (p: Plan) => p.tools.devTools ? (p.tools.devTools.period === "lifetime-per-tool" ? `${p.tools.devTools.count} free runs each` : `${p.tools.devTools.count}/month pooled`) : "Unlimited"],
                ["Cron jobs", (p: Plan) => `${p.maxCronJobs}`],
                ["Team seats", (p: Plan) => `${p.teamSeats}`],
                ["White-label reports", (p: Plan) => p.whiteLabel ? "Included" : "—"],
                ["Code Reviewer (Coming Soon)", (p: Plan) => p.id === "ultra-agency" ? "First access at launch" : "Waitlist"],
              ].map(([label, get]) => (
                <tr key={label as string} className="border-b border-line/60 last:border-0">
                  <th className="px-4 py-3 font-semibold">{label as string}</th>
                  {PLANS.map((p) => (
                    <td key={p.id} className="px-4 py-3 text-ink-soft">{(get as (p: Plan) => string)(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-mute">
        Limits are enforced by our servers, not just hidden in the screens — and trying a check again never
        double-counts. Everything listed above is built and live; when something isn&apos;t ready, we say so
        on the page instead of selling it early.
      </p>
    </div>
    </PricingCurrencyProvider>
  );
}
