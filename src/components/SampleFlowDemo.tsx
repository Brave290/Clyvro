"use client";
import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import FlowBrowser from "@/components/FlowBrowser";
import type { FlowStep } from "@/lib/flow-scan-shared";

/**
 * Public sample replay: steps from a typical (illustrative) scan of a
 * fictional business site, revealed one by one so visitors see how a
 * run unfolds. Clearly labelled a sample everywhere — a real run is
 * started after sign-up, on the visitor's own site.
 */
const T = (s: string) => `2026-01-01T00:00:${s}.000Z`;
export const SAMPLE_STEPS: FlowStep[] = [
  { at: T("01"), label: "Starting a real browser session for https://sunrise-bakery.example/…", level: "step" },
  { at: T("02"), label: "Browser started — JavaScript rendering on, forms locked out (never submitted).", level: "step" },
  { at: T("03"), label: "Opening the start page: https://sunrise-bakery.example/", level: "step" },
  { at: T("04"), label: "Rendered “Sunrise Bakery — Fresh bread, daily”", level: "step", detail: "412 words after JavaScript · 1 form(s) · 14 link(s) discovered" },
  { at: T("05"), label: "UI flaw on /: No call-to-action in the first screenful", level: "error", detail: "Put ONE primary CTA in the first viewport, next to the headline (e.g. “Order for Saturday pickup”)." },
  { at: T("06"), label: "Menu probe (desktop 1280px): no hamburger toggle — the full navigation is visible instead (6 link(s)), which is correct at this width. The phone layout is probed separately below.", level: "step" },
  { at: T("07"), label: "Switching to a phone viewport (390×844) to probe the mobile layout…", level: "step" },
  { at: T("08"), label: "Mobile menu probe: toggle found and clicked", level: "step", detail: "aria-expanded changed false → true; 6 nav link(s) visible after opening" },
  { at: T("09"), label: "Mobile UI flaw: 3 tap target(s) smaller than 24×24px", level: "error", detail: "Grow interactive targets to at least 24×24px (44×44px is the comfortable touch standard) with padding." },
  { at: T("10"), label: "Following link 1 of 3: https://sunrise-bakery.example/menu", level: "step" },
  { at: T("11"), label: "Rendered “Menu — Sunrise Bakery”", level: "step", detail: "268 words after JavaScript · 0 form(s) · 9 link(s) discovered" },
  { at: T("12"), label: "AI-pattern read of the rendered page: 24/100 (Low)", level: "step", detail: "No generic-pattern signals on the rendered page" },
  { at: T("13"), label: "Flow scan complete — 4 page(s) rendered, 0 console error(s), 0 failed request(s).", level: "step" },
];

export default function SampleFlowDemo() {
  const [shown, setShown] = useState(3);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setShown((n) => {
        if (n >= SAMPLE_STEPS.length) {
          setPlaying(false);
          if (timer.current) clearInterval(timer.current);
          return n;
        }
        return n + 1;
      });
    }, 1100);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);

  const done = shown >= SAMPLE_STEPS.length;
  return (
    <div>
      <FlowBrowser
        steps={SAMPLE_STEPS.slice(0, shown)}
        running={playing && !done}
        targetUrl="https://sunrise-bakery.example/"
        status={done ? "completed" : "running"}
        sample
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setShown(1); setPlaying(true); }}
          className="button-secondary !min-h-9 !px-3 !py-1.5 text-xs"
        >
          {done ? <RotateCcw size={13} aria-hidden /> : <Play size={13} aria-hidden />}
          {done ? "Replay the sample" : "Restart replay"}
        </button>
        <p className="text-xs text-ink-mute">
          Sample replay — steps from a typical scan of a fictional bakery site. Your run streams live like this, on your own website.
        </p>
      </div>
    </div>
  );
}
