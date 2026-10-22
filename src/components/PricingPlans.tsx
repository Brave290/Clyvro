import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Reveal from "@/components/Reveal";
import { PLANS } from "@/lib/plans";
import { LocalizedPrice, PricingCurrencyProvider } from "@/components/PricingCurrency";

/**
 * Compact plan cards shared by the landing page and the pricing page.
 * Uses the single source of truth in lib/plans (each plan's `features`
 * list) and the region-aware price component — no numbers are retyped
 * here. Wrap in PricingCurrencyProvider once per page.
 */
export function PlanCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {PLANS.map((p, i) => {
        const featured = p.id === "pro";
        const features = compact ? p.features.slice(0, 6) : p.features;
        return (
          <Reveal key={p.id} delay={i * 100} className="h-full">
            <article className={`relative flex h-full flex-col rounded-3xl border bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:shadow-[0_12px_32px_rgba(15,23,42,0.09)] sm:p-7 ${featured ? "border-accent ring-2 ring-accent/20" : "border-line"}`}>
              {featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">Most popular</span>
              )}
              <h3 className="text-xl font-bold">{p.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-ink-mute">{p.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1 text-3xl font-bold tracking-tight">
                <LocalizedPrice amountUsd={p.monthlyPriceUsd} />
                <span className="text-sm font-medium text-ink-mute">{p.monthlyPriceUsd === 0 ? "forever" : "/month"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {features.map((f) => (
                  <li key={f} className="flex gap-2 leading-snug">
                    <Check size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
                {compact && p.features.length > features.length && (
                  <li className="text-xs text-ink-mute">+ {p.features.length - features.length} more on the pricing page</li>
                )}
              </ul>
              <Link
                href={p.id === "freemium" ? "/sign-up" : "/sign-up?plan=" + p.id}
                aria-label={`${p.id === "freemium" ? "Create free account" : "Start free"} — ${p.name}: ${p.tagline}`}
                className={featured || p.id === "freemium" ? "button-primary button-primary-wide mt-7" : "button-secondary mt-7 w-full"}
              >
                {p.id === "freemium" ? "Create free account" : "Start free, upgrade in-app"}
              </Link>
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}

/** Landing-page section: headline, the four cards, and a link to the full comparison. */
export default function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Pricing</p>
            <h2 id="pricing-heading" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Start free. Pay only when the checks pay for themselves.</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Prices are shown in your region automatically. Every plan has real limits built in and no card is needed to start —
              upgrade any time from Billing inside your workspace.
            </p>
          </div>
        </Reveal>
        <div className="mt-12">
          <PricingCurrencyProvider>
            <PlanCards compact />
          </PricingCurrencyProvider>
        </div>
        <Reveal>
          <p className="mt-8 text-center text-sm text-ink-soft">
            Need the full feature-by-feature comparison?{" "}
            <Link href="/pricing" className="inline-flex min-h-8 items-center gap-1 font-semibold text-accent hover:underline">Compare every plan <ArrowRight size={15} aria-hidden /></Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
