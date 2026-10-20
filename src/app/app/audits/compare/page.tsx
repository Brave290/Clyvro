import Link from "next/link";
import { getSessionContext } from "@/lib/api";
import { compareAudits, getAuditDetail } from "@/lib/services/audits";
import type { Finding } from "@/lib/types";
import FindingCard from "@/components/FindingCard";
import { CircleAlert, GitCompareArrows, TrendingDown, TrendingUp } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

type FindingRow = Awaited<ReturnType<typeof compareAudits>>["newFindings"][number];

const rowToFinding = (r: FindingRow): Finding => ({
  ruleId: r.ruleId, ruleVersion: r.ruleVersion, page: r.page,
  category: r.category as Finding["category"], severity: r.severity as Finding["severity"],
  confidenceBasis: r.confidenceBasis as Finding["confidenceBasis"],
  title: r.title, explanation: r.explanation, evidence: r.evidence,
  recommendation: r.recommendation, effort: r.effort as Finding["effort"],
  impactRationale: r.impactRationale,
});

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ newer?: string; older?: string }>;
}) {
  const { organizationId: orgId } = await getSessionContext();
  const { newer, older } = await searchParams;

  if (!newer || !older) {
    return (
      <p className="mt-8 flex items-center gap-2 text-sm text-bad" role="alert">
        <CircleAlert size={16} aria-hidden /> Pick two audits to compare from a project&apos;s audit history.
      </p>
    );
  }

  let comparison;
  let newerAudit;
  let olderAudit;
  try {
    comparison = await compareAudits(orgId, newer, older);
    newerAudit = (await getAuditDetail(orgId, newer)).audit;
    olderAudit = (await getAuditDetail(orgId, older)).audit;
  } catch {
    return (
      <p className="mt-8 flex items-center gap-2 text-sm text-bad" role="alert">
        <CircleAlert size={16} aria-hidden /> These audits couldn&apos;t be compared (they may belong to different projects or workspaces).
      </p>
    );
  }

  const delta = comparison.scoreDelta;

  return (
    <div className="mt-8">
      <Link href={`/app/projects/${newerAudit.projectId}`} className="text-sm font-semibold text-accent hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight">
        <GitCompareArrows size={26} className="text-accent" aria-hidden /> Comparing audits
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        <LocalDateTime value={olderAudit.createdAt.toISOString()} /> → <LocalDateTime value={newerAudit.createdAt.toISOString()} />. Findings are matched
        by rule, page, and title — a finding absent from the newer audit counts as resolved only within
        the newer audit&apos;s coverage.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-ink-mute">Score change</p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold">
            {delta === null ? "—" : delta > 0 ? (
              <><TrendingUp size={20} className="text-good" aria-hidden /> +{delta}</>
            ) : delta < 0 ? (
              <><TrendingDown size={20} className="text-bad" aria-hidden /> {delta}</>
            ) : "No change"}
          </p>
          <p className="mt-1 text-xs text-ink-mute">{olderAudit.score ?? "—"} → {newerAudit.score ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-ink-mute">New findings</p>
          <p className="mt-1 text-2xl font-bold text-bad">{comparison.newFindings.length}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-ink-mute">Resolved since</p>
          <p className="mt-1 text-2xl font-bold text-good">{comparison.resolvedFindings.length}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-medium text-ink-mute">Still present</p>
          <p className="mt-1 text-2xl font-bold">{comparison.persistingCount}</p>
        </div>
      </div>

      <section className="mt-10" aria-label="New findings">
        <h2 className="text-lg font-semibold">New findings ({comparison.newFindings.length})</h2>
        <div className="mt-3 space-y-4">
          {comparison.newFindings.length === 0
            ? <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-mute" role="status">Nothing new appeared.</p>
            : comparison.newFindings.map((r, i) => <FindingCard key={r.id} f={rowToFinding(r)} index={i} />)}
        </div>
      </section>

      <section className="mt-10" aria-label="Resolved findings">
        <h2 className="text-lg font-semibold">Resolved findings ({comparison.resolvedFindings.length})</h2>
        <div className="mt-3 space-y-4">
          {comparison.resolvedFindings.length === 0
            ? <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-mute" role="status">Nothing was resolved between these two audits.</p>
            : comparison.resolvedFindings.map((r, i) => <FindingCard key={r.id} f={rowToFinding(r)} index={i} />)}
        </div>
      </section>
    </div>
  );
}
