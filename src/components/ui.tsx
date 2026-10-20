"use client";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type { Severity, ConfidenceBasis } from "@/lib/types";
import { confidenceLabel } from "@/lib/types";
import { CircleAlert, TriangleAlert, Info, CircleCheck, ChevronDown } from "lucide-react";

const SEV: Record<Severity, { cls: string; Icon: typeof Info; label: string }> = {
  critical: { cls: "bg-bad-soft text-bad", Icon: CircleAlert, label: "Critical" },
  high: { cls: "bg-warn-soft text-warn", Icon: TriangleAlert, label: "High" },
  medium: { cls: "bg-amber-50 text-amber-700", Icon: TriangleAlert, label: "Medium" },
  low: { cls: "bg-slate-100 text-slate-600", Icon: Info, label: "Low" },
};
export function SeverityBadge({ s }: { s: Severity }) {
  const { cls, Icon, label } = SEV[s];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}><Icon size={13} />{label}</span>;
}
export function ConfidenceBadge({ b }: { b: ConfidenceBasis }) {
  const Icon = b === "heuristic" ? Info : CircleCheck;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${b === "heuristic" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-line bg-canvas text-ink-soft"}`} title="How this finding was detected"><Icon size={13} />{confidenceLabel(b)}</span>;
}

/** Branded dropdown picker — custom chevron, colors and focus ring. */
export function BrandSelect({
  id,
  value,
  onChange,
  children,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`group relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-line bg-white py-2.5 pl-3.5 pr-10 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition duration-200 hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25"
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute transition duration-200 group-hover:text-accent"
      />
    </div>
  );
}

export function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(score);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * score));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const off = c * (1 - display / 100);
  const color = score >= 80 ? "#15803d" : score >= 55 ? "#d97706" : "#b91c1c";
  return (<div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Audit score ${score} out of 100`}>
    <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
    </svg>
    <div className="absolute text-center"><div className="text-4xl font-bold tracking-tight" aria-hidden>{display}</div><div className="text-[11px] font-medium text-ink-mute">/ 100 AUDIT SCORE</div></div>
  </div>);
}
