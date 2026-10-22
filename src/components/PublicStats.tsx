"use client";

import { useEffect, useState } from "react";
import { CircleAlert, FileSearch, Files, ScanLine, Sparkles } from "lucide-react";

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
    return (
      <div className="mt-3 flex animate-pulse flex-wrap justify-center gap-2" role="status" aria-label="Loading scan activity" aria-busy="true">
        <span className="h-[72px] w-36 rounded-2xl bg-line/60" aria-hidden />
        <span className="h-[72px] w-36 rounded-2xl bg-line/60" aria-hidden />
        <span className="h-[72px] w-36 rounded-2xl bg-line/60" aria-hidden />
      </div>
    );
  }

  const number = (value: number) => new Intl.NumberFormat().format(value);
  const items = [
    { Icon: ScanLine, value: stats.checks, label: "Completed checks", sub: "Websites checked" },
    { Icon: Files, value: stats.pages, label: "Pages read", sub: "Pages opened" },
    { Icon: FileSearch, value: stats.findings, label: "Problems found", sub: "Issues recorded" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <dl aria-label="Clyvro's real scan activity" className="grid grid-cols-1 overflow-hidden rounded-[1.6rem] border border-white/60 bg-white/70 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-surface/60 sm:grid-cols-3">
        {items.map(({ Icon, value, label, sub }, index) => (
          <div key={label} className={`relative px-5 py-6 text-center ${index > 0 ? "border-t border-white/60 dark:border-white/5 sm:border-l sm:border-t-0" : ""}`}>
            <dt className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-mute"><Icon size={13} className="text-accent" aria-hidden />{label}</dt>
            <dd className="mt-1.5 text-3xl font-bold tracking-tight text-ink">{number(value)}</dd>
            <span className="mt-1 block text-[11px] text-ink-mute">{sub}</span>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-mute">
        <Sparkles size={11} className="text-accent" aria-hidden />
        Live totals · No names or private data shown
      </p>
    </div>
  );
}
