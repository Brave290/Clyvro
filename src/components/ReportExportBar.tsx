"use client";

import { useState } from "react";
import { Check, ClipboardCopy, FileDown, Printer } from "lucide-react";
import type { ScanReport } from "@/lib/scanner/types";
import { reportFileSlug, reportToAgentBrief, reportToMarkdown } from "@/lib/report-export";
import { useToast } from "@/components/Toast";

/**
 * Take the report out of Clyvro:
 * - Markdown download (full evidence, agent-readable)
 * - Copy agent brief (prefilled instructions for an AI agent/developer)
 * - Print / save as PDF (browser print of the clean report area)
 */
export default function ReportExportBar({ report }: { report: ScanReport }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function downloadMarkdown() {
    const blob = new Blob([reportToMarkdown(report)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportFileSlug(report)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("success", "Report downloaded", "Markdown file with the full evidence.");
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(reportToAgentBrief(report));
      setCopied(true);
      toast("success", "Agent brief copied", "Paste it to your AI agent or developer to fix these issues.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("error", "Couldn't copy", "Your browser blocked clipboard access — download the Markdown instead.");
    }
  }

  const btn =
    "inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft transition hover:border-accent/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  return (
    <div className="mt-8 flex flex-wrap items-center justify-end gap-2 print:hidden" aria-label="Export this report">
      <button type="button" onClick={downloadMarkdown} className={btn}>
        <FileDown size={15} className="text-accent" aria-hidden /> Download report (.md)
      </button>
      <button type="button" onClick={() => void copyBrief()} className={btn} aria-live="polite">
        {copied ? <Check size={15} className="text-good" aria-hidden /> : <ClipboardCopy size={15} className="text-accent" aria-hidden />}
        {copied ? "Copied!" : "Copy agent brief"}
      </button>
      <button type="button" onClick={() => window.print()} className={btn}>
        <Printer size={15} className="text-accent" aria-hidden /> Print / save PDF
      </button>
    </div>
  );
}
