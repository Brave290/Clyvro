import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, FileCheck2, Link2, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export type AuthTone = "default" | "emergency";

interface Props {
  children: ReactNode;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  tone?: AuthTone;
  footer?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

const PROOF = [
  { icon: FileCheck2, title: "We show you what's really broken", body: "We open your pages and click everything ourselves. Every problem shows the exact page and what we saw — no guessing." },
  { icon: ShieldCheck, title: "Safe — we never touch your forms", body: "We never fill in or send your forms, and we only visit normal public pages. Your passwords are locked up safely." },
  { icon: Link2, title: "Easy to share, easy to fix", body: "Send a clean report link to your client or web person. Fix it, re-check, and see 'Fixed ✓' as proof it worked." },
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
      {/* Left brand panel — desktop only, glass accents */}
      <aside
        aria-label="About Clyvro"
        className={`relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16 ${emergency ? "bg-[#1a0b0f]" : "bg-[#0b1020]"}`}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className={`absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl ${emergency ? "bg-rose-500/25" : "bg-accent/30"}`} />
          <div className={`absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full blur-3xl ${emergency ? "bg-amber-500/15" : "bg-sky-400/15"}`} />
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]" />
          {/* subtle glass sheen */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent" />
        </div>
        <div className="relative">
          <Brand light />
        </div>
        <div className="relative">
          {emergency ? (
            <>
              <p className="inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100 backdrop-blur"><TriangleAlert size={13} aria-hidden /> Administrator emergency access</p>
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
              <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">Is your website losing<br />you customers?</h2>
              <p className="mt-4 max-w-md leading-relaxed text-white/70">
                We check your site like a real customer — clicks, forms, phone — and tell you in plain words what&apos;s broken and how to fix it.
              </p>
              <ul className="mt-8 space-y-4">
                {PROOF.map((p) => (
                  <li key={p.title} className="flex gap-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-sky-200 backdrop-blur"><p.icon size={17} aria-hidden /></span>
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

      {/* Right form column — glass on mobile, solid wash on desktop */}
      <div className="relative flex min-h-[100dvh] flex-col lg:min-h-0">
        {/* soft glass background for mobile */}
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-b from-accent-soft via-canvas to-canvas" />
          <div className="absolute -top-20 left-1/2 h-[280px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.12),transparent_68%)]" />
          <div className="absolute top-40 -right-20 h-[220px] w-[320px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.10),transparent_70%)]" />
        </div>

        <header className="relative flex items-center justify-between gap-4 border-b border-white/50 bg-white/70 px-5 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:border-white/10 dark:bg-surface/70 sm:px-8">
          <div className="lg:invisible"><Brand /></div>
          <div className="flex items-center gap-2">
            <Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink-soft shadow-sm transition hover:bg-canvas hover:text-ink">
              <ArrowLeft size={15} aria-hidden /> {backLabel}
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center px-5 pb-12 pt-8 sm:px-8">
          {/* Glass form card */}
          <div className="w-full max-w-[28rem]">
            {/* Header inside glass */}
            <div className="animate-fade-up rounded-t-[1.6rem] border border-white/60 bg-white/70 px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-surface/70">
              <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${emergency ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-deep"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${emergency ? "bg-bad" : "bg-accent"}`} aria-hidden /> {eyebrow}
              </p>
              <h1 className="mt-3 text-[1.85rem] font-bold leading-tight tracking-tight">{title}</h1>
              {lead && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead}</p>}
            </div>

            {/* Form body */}
            <div className="animate-fade-up -mt-px rounded-b-[1.6rem] border border-t-0 border-white/60 bg-white/85 px-6 py-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-surface/80" style={{ animationDelay: "70ms" }}>
              {children}
            </div>

            {footer && (
              <div className="animate-fade-up mt-4 rounded-full border border-white/60 bg-white/60 px-5 py-3 text-center text-sm text-ink-soft shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-surface/60" style={{ animationDelay: "140ms" }}>
                {footer}
              </div>
            )}

            <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-mute">
              Protected by Clyvro Shield • Your data stays yours
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
