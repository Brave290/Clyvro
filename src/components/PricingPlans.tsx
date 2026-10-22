import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import Reveal from "@/components/Reveal";
import { PLANS } from "@/lib/plans";
import { LocalizedPrice, PricingCurrencyProvider } from "@/components/PricingCurrency";

export function PlanCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {PLANS.map((p, i) => {
        const featured = p.id === "pro";
        const features = compact ? p.features.slice(0, 6) : p.features;
        const remaining = p.features.length - features.length;
        return (
          <Reveal key={p.id} delay={i * 100} className="h-full">
            <article className={`group relative flex h-full flex-col rounded-[1.6rem] border bg-white/70 p-6 shadow-[0_8px_32px_rgba(15,23,42,0.05)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(15,23,42,0.10)] sm:p-7 dark:bg-surface/60 ${featured ? "border-accent/30 ring-2 ring-accent/20" : "border-white/60 dark:border-white/10"}`}>
              {featured && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_6px_16px_rgba(37,99,235,0.30)]">
                  <Sparkles size={11} aria-hidden /> Most popular
                </span>
              )}
              <h3 className="text-xl font-bold tracking-tight">{p.name}</h3>
              <p className="mt-1 min-h-10 text-sm leading-relaxed text-ink-mute">{p.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1.5 text-3xl font-bold tracking-tight">
                <LocalizedPrice amountUsd={p.monthlyPriceUsd} />
                <span className="text-sm font-medium text-ink-mute">{p.monthlyPriceUsd === 0 ? "forever" : "/month"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {features.map((f) => (
                  <li key={f} className="flex gap-2.5 leading-snug">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-good-soft text-good">
                      <Check size={12} aria-hidden />
                    </span>
                    <span className="text-ink-soft">{f}</span>
                  </li>
                ))}
                {compact && remaining > 0 && (
                  <li className="pt-1">
                    <Link href="/pricing" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                      + {remaining} more features <ArrowRight size={12} aria-hidden />
                    </Link>
                  </li>
                )}
              </ul>
              <Link
                href={p.id === "freemium" ? "/sign-up" : "/sign-up?plan=" + p.id}
                aria-label={`${p.id === "freemium" ? "Create free account" : "Start free"} — ${p.name}: ${p.tagline}`}
                className={featured || p.id === "freemium" ? "mt-7 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)] transition hover:bg-accent-hover hover:shadow-[0_10px_28px_rgba(37,99,235,0.35)]" : "mt-7 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line bg-white/80 px-5 py-3 text-sm font-semibold text-ink backdrop-blur transition hover:bg-canvas dark:border-white/10 dark:bg-surface/60"}
              >
                {p.id === "freemium" ? "Create free account" : "Start free, upgrade inside"}
                <ArrowRight size={15} aria-hidden />
              </Link>
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}

export default function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="relative scroll-mt-20 overflow-hidden border-t border-line bg-gradient-to-b from-surface to-canvas">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_20%_10%,rgba(37,99,235,0.06),transparent_70%)]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-accent">Pricing — plain numbers</p>
            <h2 id="pricing-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Start free. Pay only when it earns its keep.</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Try Clyvro on your real website for free — no card, no tricks. You&apos;ll see exactly what we&apos;d fix for a paying customer.
              If it helps you win a sale or save a client, upgrade when you&apos;re ready — right inside your account.
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
            <Link href="/pricing" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-accent shadow-sm hover:bg-canvas">Compare all plans <ArrowRight size={15} aria-hidden /></Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
