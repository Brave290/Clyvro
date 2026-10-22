import Link from "next/link";

const PRODUCT = [
  { href: "/scan", label: "Check a website" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/flow-scan", label: "Live walk-through" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "What's new" },
  { href: "/docs/api", label: "Site API" },
];

const COMPANY = [
  { href: "/feature-requests", label: "Vote on what we build" },
  { href: "/security", label: "Security" },
  { href: "/sign-up", label: "Create a free account" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-semibold tracking-tight text-ink">
            <img src="/clyvro-icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg object-contain" />
            <span>Clyvro</span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Website checks in plain English. We show what we actually saw — and how to fix it.
          </p>
          <a href="mailto:admin.founda@gmail.com" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline">
            admin.founda@gmail.com
          </a>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Product</h2>
            <ul className="mt-2 text-sm">
              {PRODUCT.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Company</h2>
            <ul className="mt-2 text-sm">
              {COMPANY.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Legal</h2>
            <ul className="mt-2 text-sm">
              {LEGAL.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Clyvro · Founda Technologies</p>
          <p>We never invent money numbers. What we find is what we actually saw.</p>
        </div>
      </div>
    </footer>
  );
}
