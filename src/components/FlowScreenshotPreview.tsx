"use client";

import { useState } from "react";
import { Expand, Monitor, Smartphone } from "lucide-react";
import { Dialog } from "@/components/Dialog";

/**
 * Clickable scan screenshot: a thumbnail in the report that opens a larger
 * preview with a Desktop / Mobile viewport toggle. Only viewports that
 * were actually captured are offered — a missing capture is stated, never
 * faked by cropping the other one. (Mobile captures exist for the start
 * page: the phone pass always renders the start URL.)
 */
export function FlowScreenshotPreview({ finalUrl, screenshot, screenshotMobile }: {
  finalUrl: string;
  screenshot?: string;
  screenshotMobile?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const hasDesktop = !!screenshot;
  const hasMobile = !!screenshotMobile;
  if (!hasDesktop && !hasMobile) return null;

  const showingMobile = viewport === "mobile" && hasMobile;
  const src = showingMobile ? screenshotMobile : (screenshot ?? screenshotMobile);
  const viewportLabel = showingMobile ? "Mobile · 390×844" : "Desktop · 1280×800";

  return (
    <>
      <button
        type="button"
        onClick={() => { setViewport("desktop"); setOpen(true); }}
        className="group relative shrink-0 overflow-hidden rounded-lg border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={`Preview screenshot of ${finalUrl} (desktop and mobile)`}
        title="Click to preview — desktop & mobile"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screenshot ?? screenshotMobile} alt={`Screenshot of ${finalUrl} as rendered by the scan browser`}
          className="h-14 w-24 object-cover object-top" loading="lazy" />
        <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/45 group-hover:opacity-100">
          <Expand size={16} aria-hidden />
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Page preview" eyebrow="Flow Scan · screenshot">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose viewport">
          <button
            type="button"
            aria-pressed={!showingMobile}
            disabled={!hasDesktop}
            onClick={() => setViewport("desktop")}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 ${!showingMobile ? "bg-accent text-white" : "border border-line text-ink-soft hover:text-ink"}`}
          >
            <Monitor size={15} aria-hidden /> Desktop
          </button>
          <button
            type="button"
            aria-pressed={showingMobile}
            disabled={!hasMobile}
            onClick={() => setViewport("mobile")}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 ${showingMobile ? "bg-accent text-white" : "border border-line text-ink-soft hover:text-ink"}`}
          >
            <Smartphone size={15} aria-hidden /> Mobile
          </button>
          <span className="text-xs font-medium text-ink-mute">{viewportLabel}</span>
        </div>

        <div className={`mt-4 overflow-hidden rounded-xl border border-line bg-canvas ${showingMobile ? "mx-auto max-w-[280px]" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Screenshot of ${finalUrl} at the ${showingMobile ? "mobile (390×844)" : "desktop (1280×800)"} viewport, as rendered by the scan browser`}
            className="w-full object-cover object-top" />
        </div>

        <p className="mt-3 break-all text-xs font-medium text-ink">{finalUrl}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-mute">
          Captured by the scan browser during this run — the first screenful, exactly as rendered.
          {!hasMobile && " No phone capture came back for this page (its screenshot exceeded the size cap) — only viewports that were actually captured are ever shown."}
          {!hasDesktop && " No desktop capture came back for this page (its screenshot exceeded the size cap) — only viewports that were actually captured are ever shown."}
        </p>
      </Dialog>
    </>
  );
}
