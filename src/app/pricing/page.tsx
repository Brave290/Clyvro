import type { Metadata } from "next";
import Link from "next/link";
import { Check, Info } from "lucide-react";
import Reveal from "@/components/Reveal";
export const metadata: Metadata = { title: "Pricing" };
const PLANS = [
  { name: "Clyvro Dev", price: "Free in early access", note: "For evaluating Clyvro on real client work", feats: ["Live bounded scanner (available now)", "Full evidence on every finding", "Saved projects — early-access rollout", "Shareable report links — early-access rollout"], cta: "Join Clyvro Dev" },
  { name: "Professional", price: "Pricing at launch", note: "For freelancers & small agencies", feats: ["Multiple client projects", "Branded reports", "Audit history & comparisons", "Higher scan quotas"], cta: "Register interest", featured: true },
  { name: "Agency", price: "Pricing at launch", note: "For teams auditing at volume", feats: ["Team members & roles", "Scheduled re-audits", "Fix verification history", "Priority support"], cta: "Register interest" },
];
export default function Pricing() {
  return (<div className="mx-auto max-w-6xl px-5 py-14">
    <h1 className="animate-fade-up text-center text-4xl font-bold tracking-tight">Simple pricing, published when it&apos;s real</h1>
    <p style={{ animationDelay: "90ms" }} className="animate-fade-up mx-auto mt-4 max-w-2xl text-center leading-relaxed text-ink-soft">Clyvro is in phased development. Rather than invent prices today, here&apos;s the planned shape — Clyvro Dev members get free early access while we validate the reports with real agencies.</p>
    <div style={{ animationDelay: "180ms" }} className="animate-fade-up mx-auto mt-6 flex max-w-2xl items-start gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft"><Info size={16} className="mt-0.5 shrink-0 text-accent" /> No payment is taken on this site yet. Billing arrives in the commercial-launch phase, after the audit MVP has paying-customer evidence behind it.</div>
    <div className="mt-10 grid gap-5 md:grid-cols-3">{PLANS.map((p, i) => (
      <Reveal key={p.name} delay={i * 120}><article className={`h-full rounded-3xl border bg-surface p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,23,42,0.09)] ${p.featured ? "border-accent ring-2 ring-accent/20" : "border-line"}`}>
        {p.featured && <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Planned core plan</span>}
        <h2 className="mt-3 text-xl font-bold">{p.name}</h2><p className="mt-1 text-sm text-ink-mute">{p.note}</p>
        <p className="mt-5 text-2xl font-bold tracking-tight">{p.price}</p>
        <ul className="mt-5 space-y-2.5 text-sm">{p.feats.map(f => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-good" />{f}</li>)}</ul>
        <Link href="/#waitlist" className={`mt-7 block rounded-lg py-2.5 text-center text-sm font-semibold transition duration-200 hover:-translate-y-0.5 ${p.featured ? "bg-accent text-white hover:bg-accent-hover hover:shadow-md" : "border border-line hover:border-accent/50 hover:shadow-sm"}`}>{p.cta}</Link>
      </article></Reveal>))}</div>
    <p className="mt-8 text-center text-sm text-ink-mute">Feature lists describe the product roadmap (Phases 3–6), not features available today. Phase 3 is the first milestone we&apos;ll ask anyone to pay for.</p>
  </div>);
}
