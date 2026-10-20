"use client";

import { CheckCircle2, Info, TriangleAlert, Wrench, XCircle } from "lucide-react";

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export interface CheckItem {
  id: string;
  group: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string[];
}

export const STATUS_ICON: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 size={16} className="shrink-0 text-good" aria-hidden />,
  warn: <TriangleAlert size={16} className="shrink-0 text-warn" aria-hidden />,
  fail: <XCircle size={16} className="shrink-0 text-bad" aria-hidden />,
  info: <Info size={16} className="shrink-0 text-ink-mute" aria-hidden />,
};

/** Grouped check list with fix steps — shared by Readiness-style tools. */
export default function CheckReport({ checks }: { checks: CheckItem[] }) {
  const groups = [...new Set(checks.map((c) => c.group))];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g} className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold">{g}</h3>
          <ul className="mt-3 space-y-3">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="flex items-start gap-2.5">
                {STATUS_ICON[c.status]}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{c.label}</span>
                  <span className="block text-sm leading-relaxed text-ink-soft">{c.detail}</span>
                  {c.fix && (c.status === "warn" || c.status === "fail") && (
                    <span className="mt-1.5 block rounded-xl bg-canvas px-3 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent">
                        <Wrench size={12} aria-hidden /> How to fix
                      </span>
                      <span className="mt-1 block space-y-1">
                        {c.fix.map((step, i) => (
                          <span key={i} className="block text-xs leading-relaxed text-ink-soft">{i + 1}. {step}</span>
                        ))}
                      </span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SummaryPills({ summary }: { summary: { pass: number; warn: number; fail: number } }) {
  return (
    <div className="flex flex-wrap gap-3" role="status">
      <span className="rounded-xl bg-good-soft px-3 py-1.5 text-sm font-bold text-good">{summary.pass} passed</span>
      <span className="rounded-xl bg-warn-soft px-3 py-1.5 text-sm font-bold text-warn">{summary.warn} to improve</span>
      <span className="rounded-xl bg-bad-soft px-3 py-1.5 text-sm font-bold text-bad">{summary.fail} failing</span>
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-3" aria-busy="true" aria-label="Running checks">
      <div className="h-10 w-72 rounded-xl bg-line/60" />
      <div className="h-32 rounded-2xl bg-line/50" />
      <div className="h-48 rounded-2xl bg-line/50" />
    </div>
  );
}
