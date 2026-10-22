import Link from "next/link";
import { noteNotFound } from "@/lib/shield/misses";
import { ArrowRight, Radar, SearchX } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That Clyvro page doesn't exist — but a free website check is one click away.",
};

const POPULAR = [
  { href: "/scan", label: "Free website check", hint: "Scan any public site in minutes" },
  { href: "/how-it-works", label: "How it works", hint: "What we check, and how we prove it" },
  { href: "/pricing", label: "Pricing", hint: "Free to Ultra Agency plans" },
  { href: "/sign-in", label: "Sign in", hint: "Your saved scans and workspaces" },
  { href: "/refund-policy", label: "Refund policy", hint: "How billing and refunds work" },
];

/** Branded 404: honest, helpful, and routes people somewhere useful. */
export default async function NotFound() {
  // Shield's 404-burst counter (best-effort, never blocks the page).
  await noteNotFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
      <div className="text-center">
        <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <SearchX size={26} aria-hidden />
        </span>
        <p className="mt-5 text-sm font-bold uppercase tracking-[0.18em] text-ink-mute">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">That page isn&apos;t here</h1>
        <p className="mx-auto mt-3 max-w-xl leading-relaxed text-ink-soft">
          The link may be old, or the address may have a typo. Ironically, finding dead ends like this is
          exactly what Clyvro does for your website — this one, at least, was free.
        </p>
        <Link href="/scan" className="button-primary mt-7 inline-flex">
          <Radar size={16} aria-hidden /> Run a free website check
        </Link>
      </div>

      <nav aria-label="Popular pages" className="mt-12">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">Popular pages</h2>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {POPULAR.map((p) => (
            <li key={p.href}>
              <Link href={p.href}
                className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block truncate text-sm text-ink-mute">{p.hint}</span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-ink-mute transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
