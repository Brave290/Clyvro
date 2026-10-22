import Link from "next/link"; import { Logo } from "./Nav";
export default function Footer() {
  return (<footer className="border-t border-line bg-surface">
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3">
      <div><Logo /><p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">We check your website the way a real customer would — clicks, forms, phones — and tell you in plain words what's broken and how to fix it.</p></div>
      <nav aria-label="Product"><h2 className="text-sm font-semibold">Product</h2>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/scan">Check my website</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/flow-scan">Watch a browser walk my site</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/feature-requests">What we're building next — vote</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/how-it-works">How it works (no tech talk)</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/pricing">Pricing</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/changelog">What's new</Link></li></ul></nav>
      <nav aria-label="Legal"><h2 className="text-sm font-semibold">Legal</h2>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/privacy">Privacy</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/terms">Terms</Link></li>
          <li><Link className="inline-flex min-h-11 min-w-11 items-center px-2 hover:text-ink" href="/refund-policy">Refunds</Link></li></ul></nav>
    </div>
    <div className="border-t border-line py-5 text-center text-xs text-ink-mute">
      © {new Date().getFullYear()} Clyvro. A product of Founda Technologies (founded 2026).
      <span className="mt-1 block">Questions? <a className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline" href="mailto:admin.founda@gmail.com">admin.founda@gmail.com</a> — we read every message.</span>
      <span className="mt-1 block">We never invent money numbers. What we find is what we actually saw on your site.</span>
    </div>
  </footer>);
}
