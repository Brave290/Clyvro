import Link from "next/link";
import AuthCta from "@/components/AuthCta";

const PRODUCT = [
  { href: "/scan", label: "Check a website" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/flow-scan", label: "Live walk-through" },
  { href: "/pricing", label: "Pricing" },
];

const RESOURCES = [
  { href: "/developers", label: "Developers" },
  { href: "/docs/api", label: "Docs" },
  { href: "/changelog", label: "What's new" },
  { href: "/feature-requests", label: "Vote on what we build" },
];

const COMPANY = [
  { href: "/security", label: "Security" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-14 sm:flex-row sm:items-start sm:justify-between">
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
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Product</h2>
            <ul className="mt-3 text-sm">
              {PRODUCT.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Resources</h2>
            <ul className="mt-3 text-sm">
              {RESOURCES.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Company</h2>
            <ul className="mt-3 text-sm">
              {COMPANY.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink">{l.label}</Link></li>
              ))}
              <li>
                <AuthCta
                  guestHref="/sign-up"
                  guest="Create a free account"
                  signed="Open dashboard"
                  className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink"
                />
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Legal</h2>
            <ul className="mt-3 text-sm">
              {LEGAL.map((l) => (
                <li key={l.href}><Link href={l.href} className="inline-flex min-h-10 items-center text-ink-soft hover:text-ink">{l.label}</Link></li>
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
