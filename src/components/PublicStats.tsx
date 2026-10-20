"use client";

import { useEffect, useState } from "react";
import { CircleAlert, FileSearch, Files, ScanLine } from "lucide-react";

type PublicStatsData = { checks: number; pages: number; findings: number };

export default function PublicStats() {
  const [stats, setStats] = useState<PublicStatsData | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/public-stats", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("stats unavailable");
        return response.json() as Promise<PublicStatsData>;
      })
      .then(setStats)
      .catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, []);

  if (unavailable) {
    return <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-mute" role="status"><CircleAlert size={13} aria-hidden /> Live scan totals are temporarily unavailable.</p>;
  }

  if (!stats) {
    return <p className="mt-3 text-center text-xs text-ink-mute" role="status">Loading real scan activity…</p>;
  }

  const number = (value: number) => new Intl.NumberFormat().format(value);
  const items = [
    { Icon: ScanLine, value: stats.checks, label: "completed checks" },
    { Icon: Files, value: stats.pages, label: "pages read" },
    { Icon: FileSearch, value: stats.findings, label: "findings recorded" },
  ];

  return (
    <>
      <dl aria-label="Clyvro's real scan activity" className="grid grid-cols-1 overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_8px_36px_rgba(2,6,23,0.05)] sm:grid-cols-3">
        {items.map(({ Icon, value, label }, index) => (
          <div key={label} className={`px-5 py-6 text-center ${index > 0 ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}>
            <dt className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-mute"><Icon size={14} className="text-accent" aria-hidden />{label}</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-accent">{number(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-center text-xs text-ink-mute">Live totals from completed and partial database scans. No workspace names or customer details are shown.</p>
    </>
  );
}
