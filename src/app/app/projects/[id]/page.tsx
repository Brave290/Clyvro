import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProject, listProjectAudits } from "@/lib/services/audits";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { effectivePlan } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";
import RunAuditForm from "@/components/app/RunAuditForm";
import { GitCompareArrows, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  running: "bg-accent-soft text-accent",
  completed: "bg-good-soft text-good",
  partial: "bg-warn-soft text-warn",
  failed: "bg-bad-soft text-bad",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const orgId = session!.user.organizationId!;
  const { id } = await params;

  let project;
  try {
    project = await getProject(orgId, id);
  } catch (err) {
    if (err instanceof ScanError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const auditRows = await listProjectAudits(orgId, id);
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const plan = effectivePlan(org?.planId);

  const finished = auditRows.filter((a) => a.status === "completed" || a.status === "partial");

  return (
    <div className="mt-8">
      <Link href="/app" className="text-sm font-semibold text-accent hover:underline">← All projects</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{project.name}</h1>
      <p className="mt-1.5 flex items-center gap-1.5 break-all text-sm text-ink-soft">
        <Globe size={14} className="shrink-0 text-ink-mute" aria-hidden /> {project.siteUrl}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-label="Audit history">
          <h2 className="font-semibold">Audit history</h2>
          {auditRows.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-mute" role="status">
              No audits yet — run the first one on the right.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {auditRows.map((a, idx) => {
                const previous = finished.find(
                  (f) => f.id !== a.id && f.createdAt.getTime() < a.createdAt.getTime(),
                );
                return (
                  <li key={a.id} className="rounded-2xl border border-line bg-surface p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/app/audits/${a.id}`} className="font-semibold text-accent hover:underline">
                        {idx === 0 ? "Latest audit" : `Audit`} — {a.createdAt.toLocaleString()}
                      </Link>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_CLS[a.status] ?? STATUS_CLS.queued}`}>
                        {a.status}
                      </span>
                      {a.score !== null && (
                        <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold">Score {a.score}/100</span>
                      )}
                      <span className="text-xs text-ink-mute">{a.auditTypes.join(", ")}</span>
                      {previous && (a.status === "completed" || a.status === "partial") && (
                      <Link
                        href={`/app/audits/compare?newer=${a.id}&older=${previous.id}`}
                        className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                      >
                        <GitCompareArrows size={14} aria-hidden /> Compare with previous
                      </Link>
                      )}
                    </div>
                    <p className="mt-1.5 break-all text-xs text-ink-mute">{a.targetUrl}</p>
                    {a.status === "failed" && a.errorMessage && (
                      <p className="mt-2 text-sm text-bad">{a.errorMessage}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <RunAuditForm
          projectId={project.id}
          defaultUrl={project.siteUrl}
          allowedTypes={plan.auditTypes}
          planName={plan.name}
        />
      </div>
    </div>
  );
}
