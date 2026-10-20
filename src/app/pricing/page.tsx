import type { Metadata } from "next";
import Link from "next/link";
import { Check, Info, Minus } from "lucide-react";
import Reveal from "@/components/Reveal";
import { AUDIT_TYPES, PLANS, type Plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing" };

const typeName = (id: string) => AUDIT_TYPES.find((t) => t.id === id)?.name ?? id;

function entitlementRows(p: Plan): [string, boolean | string][] {
  return [
    [`${p.scansPerMonth} scans per month`, true],
    [`Up to ${p.maxPagesPerScan.toLocaleString()} pages per scan`, true],
    [`${p.maxProjects} project${p.maxProjects === 1 ? "" : "s"}`, true],
    [`Audit types: ${p.auditTypes.map(typeName).join(", ")}`, true],
    ["Saved audits, history & comparisons", true],
    ["Shareable report links (revocable)", true],
    ["Report exports", p.exports ? true : "Not included"],
    ["Scheduled monitoring (future phase)", p.monitoring ? "Included when it ships" : "Not included"],
    ["White-label reports (future phase)", p.whiteLabel ? "Included when it ships" : "Not included"],
    [`Team seats: ${p.teamSeats}`, true],
  ];
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <h1 className="animate-fade-up text-center text-4xl font-bold tracking-tight">Pricing in USD, enforced today</h1>
      <p style={{ animationDelay: "90ms" }} className="animate-fade-up mx-auto mt-4 max-w-2xl text-center leading-relaxed text-ink-soft">
        Four plans. The Freemium plan is live now — including server-enforced scan, page, and project limits.
        Paid prices below are <strong className="text-ink">proposed, not yet validated or purchasable</strong>:
        billing arrives in the commercial-launch phase. No card is required to start.
      </p>
      <div style={{ animationDelay: "180ms" }} className="animate-fade-up mx-auto mt-6 flex max-w-2xl items-start gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        No payment is taken on this site yet. When billing ships, these are the intended starting prices —
        early users will be told before anything changes. Failed scans never count against your monthly quota.
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p, i) => (
          <Reveal key={p.id} delay={i * 120}>
            <article className={`h-full rounded-3xl border bg-surface p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,23,42,0.09)] ${p.id === "pro" ? "border-accent ring-2 ring-accent/20" : "border-line"}`}>
              {p.id === "pro" && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Core plan</span>
              )}
              <h2 className="mt-3 text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-ink-mute">{p.tagline}</p>
              <p className="mt-5 text-3xl font-bold tracking-tight">
                {p.monthlyPriceUsd === 0 ? "$0" : `$${p.monthlyPriceUsd}`}
                <span className="text-base font-medium text-ink-mute">{p.monthlyPriceUsd === 0 ? " forever" : " /month (USD)"}</span>
              </p>
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
                <Link href="/sign-up" className="mt-7 block rounded-lg bg-accent py-2.5 text-center text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md">
                  Create free account
                </Link>
              ) : (
                <Link href="/#waitlist" className="mt-7 block rounded-lg border border-line py-2.5 text-center text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm">
                  Register interest
                </Link>
              )}
            </article>
          </Reveal>
        ))}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-mute">
        Plan limits are enforced by the server (not just hidden in the UI), and retries never double-count
        against your quota. Monitoring, exports, white-label, and billing are roadmap items — they&apos;ll be
        announced when they&apos;re actually built and tested, not before.
      </p>
    </div>
  );
}
