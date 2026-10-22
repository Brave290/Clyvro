import Link from "next/link"; import { Logo } from "./Nav";
export default function Footer() {
  return (<footer className="border-t border-line bg-surface">
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3">
      <div><Logo /><p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">Evidence-first website audits for agencies, freelancers, and consultants. Find the friction. Fix the conversion.</p></div>
      <nav aria-label="Product"><h2 className="text-sm font-semibold">Product</h2>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/scan">Scan a site</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/flow-scan">Flow Scan — a browser walks your site</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/feature-requests">Roadmap — vote on what&apos;s next</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/how-it-works">How it works</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/pricing">Pricing</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/changelog">What&apos;s new</Link></li></ul></nav>
      <nav aria-label="Legal"><h2 className="text-sm font-semibold">Legal</h2>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/privacy">Privacy policy</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/terms">Terms of service</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/refund-policy">Refund policy</Link></li></ul></nav>
    </div>
    <div className="border-t border-line py-5 text-center text-xs text-ink-mute">
      © {new Date().getFullYear()} Clyvro. A product of Founda Technologies (founded 2026), parent company of Brave Hx Technology.
      <span className="mt-1 block">Contact: <a className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline" href="mailto:admin.founda@gmail.com">admin.founda@gmail.com</a></span>
      <span className="mt-1 block">Audit scores are internal measures — not conversion rates or revenue predictions.</span>
    </div>
  </footer>);
}
