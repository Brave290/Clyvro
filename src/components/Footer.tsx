import Link from "next/link"; import { Logo } from "./Nav";
export default function Footer() {
  return (<footer className="border-t border-line bg-white">
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3">
      <div><Logo /><p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">Evidence-first website audits for agencies, freelancers, and consultants. Find the friction. Fix the conversion.</p></div>
      <nav aria-label="Product"><h3 className="text-sm font-semibold">Product</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          <li><Link className="hover:text-ink" href="/scan">Scan a site</Link></li>
          <li><Link className="hover:text-ink" href="/how-it-works">How it works</Link></li>
          <li><Link className="hover:text-ink" href="/example-report">Example report</Link></li>
          <li><Link className="hover:text-ink" href="/pricing">Pricing</Link></li></ul></nav>
      <nav aria-label="Legal"><h3 className="text-sm font-semibold">Legal</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          <li><Link className="hover:text-ink" href="/privacy">Privacy policy</Link></li>
          <li><Link className="hover:text-ink" href="/terms">Terms of service</Link></li></ul></nav>
    </div>
    <div className="border-t border-line py-5 text-center text-xs text-ink-mute">© 2026 Clyvro. Audit scores are internal measures — not conversion rates or revenue predictions.</div>
  </footer>);
}
