"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

export interface ToolAccessView {
  tool: string;
  label: string;
  allowed: boolean;
  used: number;
  limit: number | null;
  period: "lifetime" | "monthly" | "unlimited";
  remaining: number | null;
  planName: string;
}

/** Live allowance for one tool (same numbers the API enforces server-side). */
export function useToolAccess(toolKey: string) {
  const [access, setAccess] = useState<ToolAccessView | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tool-access");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.access) {
        setAccess((json.access as ToolAccessView[]).find((a) => a.tool === toolKey) ?? null);
      }
    } catch { /* labels are best-effort; the API gate is authoritative */ }
  }, [toolKey]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { access, refresh };
}

export function RemainingNote({ access }: { access: ToolAccessView | null }) {
  if (!access || access.limit === null) return null;
  return (
    <p className="mt-3 text-xs font-semibold text-ink-mute" role="status">
      {access.remaining} of {access.limit} {access.label} runs left
      {access.period === "lifetime" ? " on your plan (free starter runs)" : " this month"} · {access.planName} plan
    </p>
  );
}

/** The upgrade moment: shown INSTEAD of the form when runs are exhausted. */
export function UpgradePanel({ access }: { access: ToolAccessView }) {
  return (
    <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Lock size={17} className="text-accent" aria-hidden />
        You&apos;ve used your {access.label} runs
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        That was {access.used} of {access.limit} {access.period === "lifetime" ? "free starter runs" : "runs this month"} on the{" "}
        <strong className="text-ink">{access.planName}</strong> plan — full, real results, exactly what paying users get.
        To keep going: Basic and Pro raise every tool&apos;s allowance, and <strong className="text-ink">Ultra Agency removes all counters</strong> —
        unlimited Hack Protection, SEO Visibility and Developer Tools.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/pricing" className="button-primary"><Sparkles size={15} aria-hidden /> Compare plans</Link>
        <Link href="/app/billing" className="button-secondary">Go to billing</Link>
      </div>
    </div>
  );
}
