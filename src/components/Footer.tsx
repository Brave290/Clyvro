import Link from "next/link";
import { Logo } from "./Nav";
import { ShieldCheck, Mail, Sparkles, ArrowUpRight, Heart } from "lucide-react";

const PRODUCT = [
  { href: "/scan", label: "Check my website", desc: "Free health check" },
  { href: "/flow-scan", label: "Watch a browser walk my site", desc: "Live walk-through" },
  { href: "/feature-requests", label: "What we're building next", desc: "Vote on ideas" },
  { href: "/how-it-works", label: "How it works", desc: "No tech talk" },
  { href: "/pricing", label: "Pricing", desc: "From free to Agency" },
  { href: "/changelog", label: "What's new", desc: "Plain-English updates" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
  { href: "/security", label: "Security" },
];

export default function Footer() {
  return (
    <footer className="relative mt-16 overflow-hidden border-t border-line">
      {/* Glass wash */}
      <div className="absolute inset-0 bg-gradient-to-b from-canvas via-surface to-canvas" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,var(--ink)_1px,transparent_1px),linear-gradient(to_bottom,var(--ink)_1px,transparent_1px)] [background-size:40px_40px]" aria-hidden />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.14),transparent_70%)] blur-[1px]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-[300px] w-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.10),transparent_70%)] blur-[1px]" aria-hidden />

      {/* Floating glass card */}
      <div className="relative mx-auto max-w-6xl px-5 pt-10">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-white/60 shadow-[0_16px_48px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-surface/60">
          {/* top accent hairline */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/20 to-transparent" aria-hidden />

          <div className="grid gap-8 p-7 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] sm:p-8 lg:p-10">
            {/* Brand */}
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
                We check your website the way a real customer would — clicks, forms, phones — and tell you in plain words what&apos;s broken and how to fix it.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-deep dark:border-accent/20">
                <Sparkles size={13} aria-hidden />
                No fake money claims. Just what we saw.
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs text-ink-mute">
                <ShieldCheck size={14} className="text-good" aria-hidden />
                Trusted by shops, freelancers & agencies
              </div>
            </div>

            {/* Product */}
            <nav aria-label="Product">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Product</h2>
              <ul className="mt-4 space-y-3">
                {PRODUCT.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="group flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 -mx-2 transition hover:bg-canvas/80">
                      <span>
                        <span className="block text-sm font-semibold text-ink transition group-hover:text-accent">{l.label}</span>
                        <span className="block text-xs text-ink-mute">{l.desc}</span>
                      </span>
                      <ArrowUpRight size={14} className="shrink-0 text-ink-mute opacity-0 transition group-hover:text-accent group-hover:opacity-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Legal */}
            <nav aria-label="Legal">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Legal & help</h2>
              <ul className="mt-4 space-y-1.5">
                {LEGAL.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-flex min-h-9 items-center rounded-lg px-2 -mx-2 text-sm font-medium text-ink-soft transition hover:bg-canvas/80 hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <a href="mailto:admin.founda@gmail.com" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ink/90 dark:bg-white dark:text-ink">
                    <Mail size={14} aria-hidden /> Contact founder
                  </a>
                </li>
              </ul>
            </nav>

            {/* Contact / CTA */}
            <div className="rounded-2xl border border-line bg-canvas/50 p-5 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.04]">
              <h2 className="text-sm font-bold">Have a question?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                We read every message. No bot, no ticket queue — straight to the founder.
              </p>
              <a href="mailto:admin.founda@gmail.com" className="mt-4 flex items-center justify-center gap-1.5 rounded-full border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.25)] transition hover:bg-accent-hover">
                admin.founda@gmail.com
              </a>
              <p className="mt-3 text-center text-xs leading-relaxed text-ink-mute">
                Built in public by <strong className="font-semibold text-ink">Founda Technologies</strong> (2026), parent of Brave Hx Technology.
              </p>
            </div>
          </div>

          {/* Bottom bar inside glass card */}
          <div className="flex flex-col gap-3 border-t border-white/60 bg-white/40 px-7 py-4 text-xs backdrop-blur-sm dark:border-white/5 dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-1.5 text-ink-mute">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Heart size={10} aria-hidden />
              </span>
              <span>© {new Date().getFullYear()} Clyvro. Crafted with care in Lagos & remote.</span>
            </div>
            <p className="max-w-md text-ink-mute leading-relaxed sm:text-right">
              Audit scores are internal helpers — not sales or revenue predictions.
            </p>
          </div>
        </div>

        {/* Outside tiny meta */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-6 text-[11px] text-ink-mute">
          <span>We never invent money numbers.</span>
          <span className="h-1 w-1 rounded-full bg-line" aria-hidden />
          <span>What we find is what we actually saw on your site.</span>
        </div>
      </div>
    </footer>
  );
}
