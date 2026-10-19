"use client";
import Link from "next/link"; import { useState } from "react";
import { ScanSearch, Menu, X, ArrowRight } from "lucide-react";
const LINKS = [["How it works","/how-it-works"],["Example report","/example-report"],["Pricing","/pricing"]] as const;
export function Logo() {
  return (<Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white"><ScanSearch size={17} /></span>
    <span className="text-lg">Clyvro</span></Link>);
}
export default function Nav() {
  const [open, setOpen] = useState(false);
  return (<header className="sticky top-0 z-50 border-b border-line bg-white/85 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
      <Logo />
      <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex" aria-label="Main">
        {LINKS.map(([l,h]) => <Link key={h} href={h} className="transition hover:text-ink">{l}</Link>)}
        <Link href="/#waitlist" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-white transition hover:bg-accent-deep">Join the pilot <ArrowRight size={15} /></Link>
      </nav>
      <button className="md:hidden p-2" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </div>
    {open && (<nav className="border-t border-line bg-white px-5 py-4 md:hidden" aria-label="Mobile">
      <ul className="space-y-3 text-sm font-medium">
        {LINKS.map(([l,h]) => <li key={h}><Link href={h} onClick={() => setOpen(false)} className="block py-1">{l}</Link></li>)}
        <li><Link href="/#waitlist" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-white">Join the pilot <ArrowRight size={15} /></Link></li>
      </ul></nav>)}
  </header>);
}
