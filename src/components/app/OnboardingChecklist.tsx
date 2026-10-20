"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Sparkles, X } from "lucide-react";

/**
 * First-run guide driven by real workspace data (no fake progress).
 * Hides itself once every step is done, or when dismissed.
 */
export default function OnboardingChecklist({
  steps,
}: {
  steps: { label: string; hint: string; done: boolean; href: string; cta: string }[];
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem("clyvro-onboarding-dismissed") === "1");
  }, []);

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;

  return (
    <section className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-6" aria-label="Getting started">
      <div className="flex items-start gap-3">
        <Sparkles size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Get set up in a few minutes</h2>
          <p className="mt-1 text-sm text-ink-soft">{doneCount} of {steps.length} done — here&apos;s the fastest path to your first client report.</p>
          <ol className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex flex-wrap items-center gap-2.5 text-sm">
                {s.done
                  ? <CheckCircle2 size={18} className="shrink-0 text-good" aria-hidden />
                  : <Circle size={18} className="shrink-0 text-ink-mute" aria-hidden />}
                <span className={s.done ? "font-medium text-ink-mute line-through" : "font-medium"}>{s.label}</span>
                <span className="text-ink-mute">— {s.hint}</span>
                {!s.done && (
                  <Link href={s.href} className="ml-auto font-semibold text-accent hover:underline">{s.cta} →</Link>
                )}
              </li>
            ))}
          </ol>
        </div>
        <button
          onClick={() => { window.localStorage.setItem("clyvro-onboarding-dismissed", "1"); setDismissed(true); }}
          aria-label="Dismiss getting-started guide"
          className="rounded-lg p-1.5 text-ink-mute transition hover:bg-surface hover:text-ink"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
