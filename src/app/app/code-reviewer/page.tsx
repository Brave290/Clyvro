import { Bot } from "lucide-react";

/**
 * Code Reviewer is not live yet. The GitHub bot and paste checker stay
 * in the codebase, but this page is an honest Coming soon — no fake
 * install button, no paste form that looks like a working product.
 */
export default function CodeReviewerPage() {
  return (
    <div className="mt-8">
      <header>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
          Code Reviewer
          <span className="rounded-full bg-ink-mute px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Coming soon</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          A GitHub bot that reviews every reviewable file in your repositories — hardcoded secrets,
          SQL built by string concatenation, unsafe deserialization, disabled TLS, and more — with
          the exact file, line, and fix. Source is analysed in memory and never stored.
        </p>
      </header>

      <section className="form-panel mt-6 max-w-xl space-y-4" aria-label="Coming soon">
        <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
          <Bot size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          Install the Clyvro GitHub App, pick repositories, and get line-by-line findings on this page.
          We&apos;re finishing the last pieces before we turn it on — it will not pretend to work until then.
        </p>
        <button type="button" disabled className="button-primary cursor-not-allowed opacity-60">
          Coming soon
        </button>
        <p className="text-xs text-ink-mute">
          Honest scope when it ships: deterministic pattern matching, not an AI and not a penetration test.
        </p>
      </section>
    </div>
  );
}
