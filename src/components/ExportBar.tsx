"use client";

import { useState } from "react";
import { Check, ClipboardCopy, FileCode2, FileDown, Printer } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * The one export bar used by every scan/check surface:
 *  - Copy for AI agent (the full fix prompt, ready to paste)
 *  - Copy Markdown / Download .md (human + agent readable)
 *  - Download JSON (machine readable)
 *  - Print / PDF (print-optimised view) where the surface provides one
 * Content builders live in lib (report-export / check-export /
 * ai-pattern), so every surface exports the same honest content it shows.
 */
export interface ExportContent {
  markdown: string;
  agentPrompt: string;
  json?: string;
  slug: string;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExportBar({ content, showPrint = false, agentLabel = "Copy for AI agent" }: {
  content: ExportContent;
  showPrint?: boolean;
  agentLabel?: string;
}) {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(key: string, text: string, doneMsg: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast("success", "Copied", doneMsg);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      toast("error", "Couldn't copy", "Your browser blocked clipboard access — download the file instead.");
    }
  }

  const btn =
    "inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
  const primaryBtn =
    "inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" aria-label="Export this result">
      <button type="button" className={primaryBtn} onClick={() => void copy("agent", content.agentPrompt, "Paste it to your AI agent or developer.")}>
        {copiedKey === "agent" ? <Check size={15} aria-hidden /> : <ClipboardCopy size={15} aria-hidden />}
        {copiedKey === "agent" ? "Copied!" : agentLabel}
      </button>
      <button type="button" className={btn} onClick={() => void copy("md", content.markdown, "Markdown is on your clipboard.")}>
        {copiedKey === "md" ? <Check size={15} className="text-good" aria-hidden /> : <ClipboardCopy size={15} className="text-accent" aria-hidden />}
        Copy Markdown
      </button>
      <button type="button" className={btn} onClick={() => { download(`${content.slug}.md`, content.markdown, "text/markdown;charset=utf-8"); toast("success", "Downloaded", "Markdown file with the full evidence."); }}>
        <FileDown size={15} className="text-accent" aria-hidden /> .md
      </button>
      {content.json && (
        <button type="button" className={btn} onClick={() => { download(`${content.slug}.json`, content.json!, "application/json;charset=utf-8"); toast("success", "Downloaded", "Structured JSON for your own tooling."); }}>
          <FileCode2 size={15} className="text-accent" aria-hidden /> JSON
        </button>
      )}
      {showPrint && (
        <button type="button" className={btn} onClick={() => window.print()}>
          <Printer size={15} className="text-accent" aria-hidden /> Print / PDF
        </button>
      )}
    </div>
  );
}
