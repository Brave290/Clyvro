import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Reveal from "@/components/Reveal";
import { PLANS } from "@/lib/plans";
import { LocalizedPrice, PricingCurrencyProvider } from "@/components/PricingCurrency";
import AuthCta from "@/components/AuthCta";

/**
 * Compact plan cards — now in plain language: what you can do, not what the system is called.
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
                <LocalizedPrice planId={p.id} amountUsd={p.monthlyPriceUsd} />
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
              <AuthCta
                guestHref={p.id === "freemium" ? "/sign-up" : "/sign-up?plan=" + p.id}
                guest={p.id === "freemium" ? "Create free account" : `Start ${p.name} free`}
                signedHref={p.id === "freemium" ? "/app/scan" : "/app/billing"}
                signed={p.id === "freemium" ? "Open dashboard" : `Go to billing`}
                ariaLabel={p.id === "freemium" ? "Open your Clyvro workspace" : `Start ${p.name} inside your account`}
                className={featured || p.id === "freemium" ? "button-primary button-primary-wide mt-7" : "button-secondary mt-7 w-full"}
              />
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}

/** Landing-page section */
export default function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Pricing — plain numbers</p>
            <h2 id="pricing-heading" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Start free. Pay only when it earns its keep.</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Try Clyvro on your real website for free — no card, no tricks. You'll see exactly what we'd fix for a paying customer.
              If it helps you win a sale or save a client, upgrade when you're ready — right inside your account.
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
            Want every detail, side-by-side?{" "}
            <Link href="/pricing" className="inline-flex min-h-8 items-center gap-1 font-semibold text-accent hover:underline">Compare all plans <ArrowRight size={15} aria-hidden /></Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
