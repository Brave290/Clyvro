"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className = "",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* browser blocked clipboard */
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-accent/40 hover:bg-canvas ${className}`}
    >
      {done ? <Check size={13} className="text-good" aria-hidden /> : <Copy size={13} aria-hidden />}
      {done ? copiedLabel : label}
    </button>
  );
}

export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-mute">{caption ?? "Example"}</p>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-ink">{code}</pre>
    </div>
  );
}
