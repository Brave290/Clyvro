import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, FileCheck2, Link2, ScanSearch, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Shared frame for every account page (sign in, create account, recovery,
 * emergency access). Full-height split layout: a dark brand panel with a
 * small, truthful product preview on the left, the form card on the
 * right. The public site nav is suppressed on these routes, so the frame
 * carries its own minimal header (brand, back link, theme toggle).
 */

export type AuthTone = "default" | "emergency";

interface Props {
  children: ReactNode;
  /** Small uppercase line above the title. */
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  tone?: AuthTone;
  /** Links shown under the card ("New here? Create an account"). */
  footer?: ReactNode;
  /** Text for the top-right back link. */
  backHref?: string;
  backLabel?: string;
}

const PROOF = [
  { icon: FileCheck2, title: "Real scans, real evidence", body: "Pages are actually visited and measured. Every finding shows what we saw and where." },
  { icon: ShieldCheck, title: "Safe by design", body: "Forms are never submitted, passwords are scrypt-hashed, deep scans need DNS-verified ownership." },
  { icon: Link2, title: "Client-ready reports", body: "Shareable links, PDF and Markdown exports, and fix tracking that proves the change worked." },
];

function Brand({ light }: { light?: boolean }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${light ? "text-white" : "text-ink"}`}>
      <img src="/clyvro-icon.png" alt="Clyvro" width={36} height={36} className="h-9 w-9 rounded-xl object-contain shadow-[0_6px_18px_rgba(37,99,235,0.35)]" />
      <span className="text-lg">Clyvro</span>
      <span className="rounded-full bg-accent/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Beta</span>
    </Link>
  );
}

/** Decorative, clearly illustrative report preview — no invented customer numbers. */
function ReportPreview() {
  const rows = [
    { label: "Checkout link returns 404", tone: "bad", tag: "Confirmed" },
    { label: "Contact form posts over http://", tone: "bad", tag: "Confirmed" },
    { label: "Hero loads in 3.8 s on 4G", tone: "warn", tag: "Measured" },
    { label: "Pricing page has no next step", tone: "mute", tag: "Best guess" },
  ] as const;
  const dot = { bad: "bg-rose-400", warn: "bg-amber-300", mute: "bg-slate-400" } as const;
  return (
    <div className="relative mt-10 w-full max-w-sm" aria-hidden>
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-white/20 via-white/5 to-transparent" />
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Example report</p>
            <p className="mt-0.5 text-sm font-semibold text-white">shop.example · 10 pages</p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-amber-300/80 text-sm font-bold text-white">61</div>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/85">
              <span className="flex min-w-0 items-center gap-2"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[r.tone]}`} /><span className="truncate">{r.label}</span></span>
              <span className="shrink-0 rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">{r.tag}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/55"><Sparkles size={12} aria-hidden /> Illustrative sample — your report shows your site&apos;s real findings.</p>
      </div>
    </div>
  );
}

export default function AuthShell({ children, eyebrow, title, lead, tone = "default", footer, backHref = "/", backLabel = "Back to site" }: Props) {
  const emergency = tone === "emergency";
  return (
    <div className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <aside
        aria-label="About Clyvro"
        className={`relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16 ${emergency ? "bg-[#1a0b0f]" : "bg-[#0b1020]"}`}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className={`absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl ${emergency ? "bg-rose-500/25" : "bg-accent/30"}`} />
          <div className={`absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full blur-3xl ${emergency ? "bg-amber-500/15" : "bg-sky-400/15"}`} />
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]" />
        </div>
        <div className="relative">
          <Brand light />
        </div>
        <div className="relative">
          {emergency ? (
            <>
              <p className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100"><TriangleAlert size={13} aria-hidden /> Administrator emergency access</p>
              <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight xl:text-4xl">The door that stays open<br />when everything else is locked.</h2>
              <p className="mt-4 max-w-md leading-relaxed text-white/70">
                This page is exempt from Shield blocks so a platform administrator can always get back in — even from a banned address or during Under-attack mode. It is hidden, logged, and rate-limited.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-white/80">
                <li className="flex gap-3"><CircleCheck size={17} className="mt-0.5 shrink-0 text-rose-200" aria-hidden /> Every attempt — success or failure — is written to the security log.</li>
                <li className="flex gap-3"><CircleCheck size={17} className="mt-0.5 shrink-0 text-rose-200" aria-hidden /> Five failures per address in 15 minutes closes the door for a while.</li>
                <li className="flex gap-3"><CircleCheck size={17} className="mt-0.5 shrink-0 text-rose-200" aria-hidden /> Success marks this browser as trusted for 30 days and lifts a ban on your current address.</li>
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">Find the friction.<br />Fix the conversion.</h2>
              <p className="mt-4 max-w-md leading-relaxed text-white/70">
                Evidence-first website checks: every finding shows what we observed, where, and how to fix it — then proves the fix worked.
              </p>
              <ul className="mt-8 space-y-4">
                {PROOF.map((p) => (
                  <li key={p.title} className="flex gap-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-sky-200"><p.icon size={17} aria-hidden /></span>
                    <span className="text-sm leading-relaxed text-white/80"><strong className="block font-semibold text-white">{p.title}</strong>{p.body}</span>
                  </li>
                ))}
              </ul>
              <ReportPreview />
            </>
          )}
        </div>
        <p className="relative text-xs text-white/45">© {new Date().getFullYear()} Clyvro · <Link href="/security" className="hover:text-white/80">Security</Link> · <Link href="/privacy" className="hover:text-white/80">Privacy</Link></p>
      </aside>

      {/* Form column */}
      <div className="flex min-h-[100dvh] flex-col lg:min-h-0">
        <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="lg:invisible"><Brand /></div>
          <div className="flex items-center gap-2">
            <Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition hover:bg-surface hover:text-ink">
              <ArrowLeft size={15} aria-hidden /> {backLabel}
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8">
          <div className="w-full max-w-[26.5rem]">
            <div className="animate-fade-up">
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${emergency ? "text-bad" : "text-accent"}`}>{eyebrow}</p>
              <h1 className="mt-2 text-[1.9rem] font-bold leading-tight tracking-tight sm:text-3xl">{title}</h1>
              {lead && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead}</p>}
            </div>
            <div className="animate-fade-up mt-6" style={{ animationDelay: "70ms" }}>
              {children}
            </div>
            {footer && <div className="animate-fade-up mt-6 text-center text-sm text-ink-soft" style={{ animationDelay: "140ms" }}>{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
