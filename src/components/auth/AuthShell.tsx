import type { ReactNode } from "react";
import Link from "next/link";
import { FileCheck2, Link2, ScanSearch, ShieldCheck } from "lucide-react";

/**
 * Shared frame for sign-in / create-account: a calm brand panel (product
 * promise, no invented numbers) beside the form. Stacks on mobile.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
      <aside className="hidden flex-col justify-center lg:flex" aria-label="About Clyvro">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white shadow-sm">
            <ScanSearch size={19} aria-hidden />
          </span>
          <span className="text-xl">Clyvro</span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Beta</span>
        </Link>
        <h2 className="mt-8 text-3xl font-bold leading-tight tracking-tight">
          Find the friction.<br />Fix the conversion.
        </h2>
        <p className="mt-3 max-w-md leading-relaxed text-ink-soft">
          Evidence-first website checks: every finding shows what we observed, where, and how to fix it —
          then proves the fix worked.
        </p>
        <ul className="mt-8 space-y-4 text-sm">
          <li className="flex gap-3">
            <FileCheck2 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span><strong>Real scans, real evidence.</strong> Pages are actually visited and measured — nothing is invented.</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span><strong>Safe by design.</strong> Forms are never submitted, passwords are hashed, deep scans need DNS-verified ownership.</span>
          </li>
          <li className="flex gap-3">
            <Link2 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span><strong>Client-ready reports.</strong> Shareable links, PDF and Markdown exports, fix tracking.</span>
          </li>
        </ul>
      </aside>
      <div className="w-full max-w-lg justify-self-center lg:justify-self-end">{children}</div>
    </div>
  );
}
