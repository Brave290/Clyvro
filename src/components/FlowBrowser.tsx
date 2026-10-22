"use client";
import { useEffect, useRef } from "react";
import { Check, Circle, Globe, LoaderCircle, Lock, MousePointerClick, StopCircle } from "lucide-react";
import { flowPlanPhases, latestPreview, type FlowStep } from "@/lib/flow-scan-shared";

/**
 * Live browser container. The viewport is the actual JPEG the headless
 * Chromium just captured — not a mock, not an animation. The step list
 * and agent plan sit under/beside it so you can see the page as the
 * walker moves.
 */
export default function FlowBrowser({
  steps,
  running,
  targetUrl,
  status,
  sample = false,
}: {
  steps: FlowStep[];
  running: boolean;
  targetUrl: string;
  status: string;
  sample?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length]);

  const preview = latestPreview(steps);
  const currentUrl = (() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const m = `${steps[i].label} ${steps[i].detail ?? ""}`.match(/https?:\/\/[^\s"”]+/);
      if (m) return m[0];
    }
    return targetUrl;
  })();
  const host = (() => { try { return new URL(currentUrl).hostname; } catch { return targetUrl; } })();
  const pagesRendered = steps.filter((s) => s.label.startsWith("Rendered")).length;
  const lastStep = steps[steps.length - 1];
  const phases = flowPlanPhases(steps, status);
  const flaws = steps.filter((s) => s.level === "error").length;
  const notes = steps.filter((s) => s.level === "note").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm" aria-live="polite" aria-label="Live browser view of the scan">
      <div className="flex items-end gap-3 bg-canvas px-4 pt-3">
        <span className="flex gap-1.5 pb-2.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        </span>
        <span className="pb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Clyvro Browser</span>
        <div className="flex min-w-0 max-w-xs flex-1 items-center gap-2 rounded-t-lg bg-surface px-3 py-2 text-xs font-medium text-ink-soft">
          <Globe size={12} className="shrink-0 text-accent" aria-hidden />
          <span className="truncate">{host}</span>
          {running && <LoaderCircle size={12} className="ml-auto shrink-0 animate-spin text-accent" aria-hidden />}
        </div>
        <span className={`ml-auto mb-2 hidden rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:block ${
          sample ? "bg-warn-soft text-warn"
            : status === "completed" ? "bg-good-soft text-good"
            : status === "failed" ? "bg-bad-soft text-bad"
            : "bg-accent-soft text-accent"
        }`}>
          {sample ? "Sample replay" : running ? "● Live" : status}
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <Lock size={12} className="shrink-0 text-good" aria-hidden />
        <span className="min-w-0 flex-1 truncate rounded-md bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink-soft" title={currentUrl}>{currentUrl}</span>
        <span className="hidden shrink-0 text-xs text-ink-mute md:block">
          {pagesRendered > 0 ? `Page ${pagesRendered} rendered` : "Starting…"} · up to 5 pages
        </span>
      </div>

      {/* Live picture — the actual page the walker just rendered */}
      <div className="relative bg-[#0b1020]">
        {preview ? (
          <img
            src={preview}
            alt={sample ? "Sample viewport (not a live site)" : `Live page as the scan browser sees ${currentUrl}`}
            className="mx-auto max-h-[28rem] w-full object-contain object-top"
          />
        ) : (
          <div className="grid min-h-[14rem] place-items-center px-6 py-10 text-center text-sm text-white/70">
            {running
              ? "Opening the real page… the first picture lands as soon as Chromium paints it."
              : sample
                ? "Sample replay — a live run shows the real page here."
                : "No viewport picture on this run. If the browser couldn't start, the step log says so — nothing is simulated."}
          </div>
        )}
        {running && (
          <span className="absolute left-3 top-3 rounded-full bg-bad px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Live
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-[1fr_260px]">
        <div className="max-h-[18rem] overflow-y-auto p-5">
          {steps.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-mute">
              <LoaderCircle size={15} className="animate-spin text-accent" aria-hidden /> Opening the browser…
            </p>
          ) : (
            <ol className="space-y-2.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.level === "error" ? "bg-bad" : s.level === "note" ? "bg-warn" : "bg-accent"}`} />
                  <span className="min-w-0">
                    <span className={s.level === "error" ? "font-semibold text-bad" : s.level === "note" ? "font-medium text-warn" : "text-ink"}>{s.label}</span>
                    {s.detail && <span className="block break-words text-xs leading-relaxed text-ink-mute">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        <aside className="border-t border-line bg-canvas/60 p-4 md:border-l md:border-t-0" aria-label="Agent plan">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">Agent plan</p>
          <ol className="mt-3 space-y-2.5">
            {phases.map((p) => (
              <li key={p.id} className="flex items-start gap-2 text-xs leading-relaxed">
                {p.state === "done" ? <Check size={14} className="mt-0.5 shrink-0 text-good" aria-hidden />
                  : p.state === "active" ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin text-accent" aria-hidden />
                  : p.state === "stopped" ? <StopCircle size={14} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                  : <Circle size={14} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />}
                <span className={p.state === "done" ? "text-ink-mute line-through decoration-ink-mute/50" : p.state === "active" ? "font-semibold text-ink" : "text-ink-soft"}>
                  {p.label}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-line pt-3 text-xs text-ink-mute">
            <p><strong className="text-ink">{flaws}</strong> thing{flaws === 1 ? "" : "s"} needing fixes · <strong className="text-ink">{notes}</strong> note{notes === 1 ? "" : "s"}</p>
            <p className="mt-1">Forms are never submitted. Checkout, delete and sign-out are never clicked.</p>
          </div>
        </aside>
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-canvas px-4 py-2 text-xs text-ink-mute">
        {running ? <LoaderCircle size={12} className="shrink-0 animate-spin text-accent" aria-hidden /> : <MousePointerClick size={12} className="shrink-0 text-accent" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{lastStep ? lastStep.label : "Waiting for the browser…"}</span>
        <span className="shrink-0">{steps.length} step{steps.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
