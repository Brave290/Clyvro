import type { Metadata } from "next";
import Link from "next/link";
import { Check, Info, Minus } from "lucide-react";
import Reveal from "@/components/Reveal";
import { currentPlans, allowanceText, planAtLeast, type Plan } from "@/lib/plans";
import { getDb } from "@/lib/db";
import { LocalizedPrice, PricingCurrencyProvider } from "@/components/PricingCurrency";
import AuthCta from "@/components/AuthCta";

export const metadata: Metadata = {
  title: "Pricing — how much to keep your site healthy",
  description: "Start free, see what's broken on your real site, then pick a plan if it helps. From free to Agency — no hidden fees, pay only if it earns its keep.",
  alternates: { canonical: "/pricing" },
};

function toolHackSeoLabel(p: Plan): boolean | string {
  const rule = p.tools.hackSeo;
  if (!rule) return true;
  return rule.period === "lifetime" ? `${rule.count} free tries` : `${rule.count} runs/month`;
}
function toolDevLabel(p: Plan): boolean | string {
  const rule = p.tools.devTools;
  if (!rule) return true;
  return rule.period === "lifetime-per-tool" ? `${rule.count} free tries per tool` : `${rule.count} runs/month shared`;
}

function entitlementRows(p: Plan): [string, boolean | string][] {
  return [
    [`${p.scansPerMonth} website checks per month`, true],
    [`We look at up to ${p.maxPagesPerScan.toLocaleString()} pages each check`, true],
    [`Track ${p.maxProjects} website${p.maxProjects === 1 ? "" : "s"}`, true],
    ["Full website check — links, Google, accessibility, forms, safety", true],
    ["Save your reports, see what changed, compare before & after", true],
    ["Send report links to clients (turn off anytime)", true],
    ["Workspaces for clients + team roles", true],
    [`Team seats: ${p.teamSeats}`, true],
    ["Your logo & colors on shared reports", p.whiteLabel ? true : "Not included"],
    ["Daily/weekly re-checks of saved sites + email when something new breaks", p.monitoring ? true : "Not included"],
    ["Download reports (PDF, Markdown) to keep or send", p.exports],
    [`Whole-site deep check (every page, every link — only your verified sites): ${allowanceText(p.deepScans)}`, true],
    ["Is your site ready for customers? check", p.readiness === "full" ? "Our strictest checks" : p.readiness === "basic" ? "Starter checks" : "Free 24-hour trial"],
    [`Does it sound human? AI-text check + fix suggestion: ${allowanceText(p.aiDetector, "checks")}`, true],
    [`Browser walk-through — a real phone walks your site: ${allowanceText(p.flowScan)}`, true],
    [`Full Scan — everything in one go: ${p.fullScan === null ? "Unlimited" : p.fullScan.count === 0 ? "Pro & Agency only" : allowanceText(p.fullScan)}`, true],
    [`Authorized pentest (verified domain + written consent): ${p.pentest === null ? "Unlimited" : p.pentest.count === 0 ? "Pro & Agency only" : allowanceText(p.pentest)}`, true],
    [`Lab — HTTP repeater + 500+ path checks (verified domain): ${planAtLeast(p, "pro") ? "Included" : "Pro & Agency only"}`, true],
    [`Scheduled jobs of your own (URL pings — not site re-scans): ${p.maxCronJobs}`, true],
    ["Vote on what we build next & ask others to back you", true],
    ["Safety check (are your doors locked?)", toolHackSeoLabel(p)],
    ["Google check (can customers find you on search?)", toolHackSeoLabel(p)],
    ["5 web helper tools: security, domain name, redirects, headers, robots", toolDevLabel(p)],
  ];
}

export default async function Pricing() {
  await getDb();
  const PLANS = currentPlans();
  return (
    <PricingCurrencyProvider>
    <div className="mx-auto max-w-6xl px-5 py-14">
      <h1 className="animate-fade-up text-center text-4xl font-bold tracking-tight">Simple pricing — pay only if it helps you sell</h1>
      <p style={{ animationDelay: "90ms" }} className="animate-fade-up mx-auto mt-4 max-w-2xl text-center leading-relaxed text-ink-soft">
        Start free on your real website — no card needed. See exactly what we'd fix for a paying customer.
        If it helps you win a sale or keep a client, upgrade inside your account when you're ready.
        Prices show in your currency automatically.
      </p>
      <div style={{ animationDelay: "180ms" }} className="animate-fade-up mx-auto mt-6 flex max-w-2xl items-start gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        Payments are handled by Flutterwave from the Billing page in your account. If checkout says "not switched on yet", you can't be charged — we tell you honestly there too.
        A check that fails to run never counts against your monthly total.
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-ink-mute">
        Every plan lets you <strong className="text-ink">try the extra tools for free</strong> — real checks on your real site, so you can see they work. <strong className="text-ink">Agency</strong> lifts the counters on extra tools (deep checks, walk-throughs, AI-text, Safety, Google, web helpers). Website checks, pages per check, saved sites, seats and scheduled jobs still have the published caps.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p, i) => (
          <Reveal key={p.id} delay={i * 120}>
            <article className={`h-full rounded-3xl border bg-surface p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.09)] ${p.id === "pro" ? "border-accent ring-2 ring-accent/20" : "border-line"}`}>
              {p.id === "pro" && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Most popular</span>
              )}
              <h2 className="mt-3 text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-ink-mute">{p.tagline}</p>
              <p className="mt-5 text-3xl font-bold tracking-tight">
                <LocalizedPrice planId={p.id} amountUsd={p.monthlyPriceUsd} />
                <span className="text-base font-medium text-ink-mute">{p.monthlyPriceUsd === 0 ? " forever" : " /month*"}</span>
              </p>
              {p.monthlyPriceUsd > 0 && <p className="mt-1 text-xs text-ink-mute">*Price for your region; exact charge shown at checkout.</p>}
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
              <AuthCta
                guestHref={p.id === "freemium" ? "/sign-up" : `/sign-up?plan=${p.id}`}
                guest={p.id === "freemium" ? "Create free account" : `Start ${p.name} free`}
                signedHref={p.id === "freemium" ? "/app/scan" : "/app/billing"}
                signed={p.id === "freemium" ? "Open dashboard" : "Go to billing"}
                ariaLabel={p.id === "freemium" ? "Open your Clyvro workspace" : `Start ${p.name} inside your account`}
                className={p.id === "freemium" || p.id === "pro" ? "button-primary button-primary-wide mt-7" : "button-secondary mt-7 w-full"}
              />
            </article>
          </Reveal>
        ))}
      </div>

      <section aria-label="Full plan comparison" className="mt-12">
        <h2 className="text-center text-2xl font-bold tracking-tight">Compare every plan side-by-side</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-ink-mute">
          Extra tools include free tries on every plan — real checks, so you can see they work before paying.
          Unlimited on a row means we don&apos;t count that extra tool. Agency still has monthly website-check, page, site, seat and scheduled-job caps.
        </p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-4 py-3">What you get</th>
                {PLANS.map((p) => <th key={p.id} className="px-4 py-3">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ["Website checks / month", (p: Plan) => `${p.scansPerMonth.toLocaleString()}`],
                ["Pages we look at per check", (p: Plan) => `Up to ${p.maxPagesPerScan.toLocaleString()}`],
                ["Websites you can track", (p: Plan) => `${p.maxProjects}`],
                ["Whole-site deep check", (p: Plan) => `${allowanceText(p.deepScans)} (your verified sites only)`],
                ["Is your site ready for customers?", (p: Plan) => p.readiness === "full" ? "Our strictest" : p.readiness === "basic" ? "Starter checks" : "24-hour trial"],
                ["Does it sound human? AI check", (p: Plan) => allowanceText(p.aiDetector, "checks")],
                ["Browser walk-through (we watch like a customer)", (p: Plan) => allowanceText(p.flowScan)],
                ["Full Scan (everything in one go)", (p: Plan) => allowanceText(p.fullScan)],
                ["Authorized pentest (verified domain + consent)", (p: Plan) => p.pentest === null ? "Unlimited" : p.pentest.count === 0 ? "Pro & Agency only" : allowanceText(p.pentest)],
                ["Safety check (are doors locked?)", (p: Plan) => p.tools.hackSeo ? (p.tools.hackSeo.period === "lifetime" ? `${p.tools.hackSeo.count} free tries` : `${p.tools.hackSeo.count}/month`) : "Unlimited"],
                ["Google check (can people find you?)", (p: Plan) => p.tools.hackSeo ? (p.tools.hackSeo.period === "lifetime" ? `${p.tools.hackSeo.count} free tries` : `${p.tools.hackSeo.count}/month`) : "Unlimited"],
                ["5 web helper tools", (p: Plan) => p.tools.devTools ? (p.tools.devTools.period === "lifetime-per-tool" ? `${p.tools.devTools.count} free tries each` : `${p.tools.devTools.count}/month shared`) : "Unlimited"],
                ["Daily/weekly re-checks of saved sites + email when something new breaks", (p: Plan) => p.monitoring ? "Included" : "—"],
                ["Scheduled jobs of your own (URL pings — not site re-scans)", (p: Plan) => `${p.maxCronJobs}`],
                ["Team members", (p: Plan) => `${p.teamSeats}`],
                ["Your logo on reports", (p: Plan) => p.whiteLabel ? "Yes" : "—"],
                ["Vote on what we build next", () => "Included (free account)"],
                ["Code Reviewer (CLI walk, GitHub bot, or paste)", () => "Included"],
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
        We don't hide limits in small print — they're checked by our computers, and trying again never double-charges you. Everything listed above works today; if something's not ready, we tell you on that page instead of selling it early.
      </p>
    </div>
    </PricingCurrencyProvider>
  );
}
