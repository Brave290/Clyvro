import Link from "next/link";
import { Logo } from "./Nav";

const PRODUCT = [
  { href: "/scan", label: "Check my website" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/flow-scan", label: "Watch a browser walk my site" },
  { href: "/feature-requests", label: "Vote on what we build next" },
  { href: "/changelog", label: "What's new" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
  { href: "/security", label: "Security" },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
            We check your website the way a real customer would — clicks, forms, phones — and tell you in plain words what&apos;s broken and how to fix it.
          </p>
        </div>
        <nav aria-label="Product">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Product</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {PRODUCT.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-soft hover:text-ink hover:underline">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Legal</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-soft hover:text-ink hover:underline">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Contact</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Questions? We read every message.</p>
          <a href="mailto:admin.founda@gmail.com" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
            admin.founda@gmail.com
          </a>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Clyvro. A product of Founda Technologies.</p>
          <p>We never invent money numbers. What we find is what we actually saw on your site.</p>
        </div>
      </div>
    </footer>
  );
}
