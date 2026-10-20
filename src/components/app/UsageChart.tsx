"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartNoAxesColumnIncreasing, CreditCard } from "lucide-react";

const DAYS = 14;

type Props = { used: number; limit: number; events: string[] };
type Day = { key: string; label: string; count: number };

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function UsageChart({ used, limit, events }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const days = useMemo<Day[]>(() => {
    if (!mounted) return [];
    const counts = new Map<string, number>();
    for (const raw of events) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) {
        const key = localDayKey(date);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
    return Array.from({ length: DAYS }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (DAYS - index - 1));
      const key = localDayKey(date);
      return { key, label: formatter.format(date), count: counts.get(key) ?? 0 };
    });
  }, [events, mounted]);

  const remaining = Math.max(0, limit - used);
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  const formatter = mounted ? new Intl.NumberFormat() : null;
  const recentCount = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="usage-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="usage-title" className="flex items-center gap-2 font-semibold"><ChartNoAxesColumnIncreasing size={17} className="text-accent" aria-hidden /> Free usage &amp; scan budget</h2>
          <p className="mt-1 text-sm text-ink-soft">Workspace checks used this quota month</p>
        </div>
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent">
          {formatter ? formatter.format(used) : used} of {formatter ? formatter.format(limit) : limit} · {formatter ? formatter.format(remaining) : remaining} left
        </p>
      </div>

      {mounted ? (
        <div className="mt-5" role="img" aria-label={`Daily scan usage for the last ${DAYS} days; ${recentCount} scans recorded in this chart`}>
          <div className="grid h-28 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5 sm:gap-2">
            {days.map((day) => (
              <div key={day.key} className="flex h-full flex-col justify-end" title={`${day.label}: ${day.count} ${day.count === 1 ? "scan" : "scans"}`}>
                <div className="min-h-0 w-full rounded-t-sm bg-accent transition-[height] duration-200" style={{ height: `${day.count === 0 ? 0 : Math.max(8, (day.count / maxCount) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 text-center text-[10px] text-ink-mute sm:gap-2">
            {days.map((day) => <span key={day.key}>{day.label}</span>)}
          </div>
          <p className="mt-3 text-xs text-ink-mute">{recentCount} real scan{recentCount === 1 ? "" : "s"} in the last {DAYS} days. Daily dates use your device timezone; quota resets on the UTC calendar month.</p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-ink-mute" role="status">Loading device-local usage chart…</p>
      )}

      <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-ink-mute">
        <CreditCard size={14} className="mt-0.5 shrink-0" aria-hidden />
        This free chart tracks scans for everyone in this workspace, not dollar spend. Clyvro billing is not active, so no money has been charged.
      </p>
    </section>
  );
}
