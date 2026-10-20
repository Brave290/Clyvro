"use client";

import type { ScanReport } from "@/lib/scanner/types";
import { reportFileSlug, reportToAgentBrief, reportToJson, reportToMarkdown } from "@/lib/report-export";
import ExportBar from "@/components/ExportBar";

/**
 * Take the scan report out of Clyvro — now the shared ExportBar:
 * Copy for AI agent, Copy Markdown, Download .md, Download JSON,
 * and Print / save as PDF (browser print of the clean report area).
 */
export default function ReportExportBar({ report }: { report: ScanReport }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
      <ExportBar
        showPrint
        agentLabel="Copy agent brief"
        content={{
          markdown: reportToMarkdown(report),
          agentPrompt: reportToAgentBrief(report),
          json: reportToJson(report),
          slug: reportFileSlug(report),
        }}
      />
    </div>
  );
}
