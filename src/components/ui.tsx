import type { Severity, ConfidenceBasis } from "@/lib/types";
import { confidenceLabel } from "@/lib/types";
import { CircleAlert, TriangleAlert, Info, CircleCheck } from "lucide-react";

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
export function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  const color = score >= 80 ? "#15803d" : score >= 55 ? "#d97706" : "#b91c1c";
  return (<div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Audit score ${score} out of 100`}>
    <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
    </svg>
    <div className="absolute text-center"><div className="text-4xl font-bold tracking-tight">{score}</div><div className="text-[11px] font-medium text-ink-mute">/ 100 AUDIT SCORE</div></div>
  </div>);
}
