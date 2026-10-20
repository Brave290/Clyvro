import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/api";
import { getProject, listProjectAudits } from "@/lib/services/audits";
import { getClient } from "@/lib/services/clients";
import { getOrganization } from "@/lib/services/orgs";
import {effectivePlanForOrg, } from "@/lib/plans";
import { canWrite } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";
import RunAuditForm from "@/components/app/RunAuditForm";
import AssignClientSelect from "@/components/app/AssignClientSelect";
import { GitCompareArrows, Globe } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  running: "bg-accent-soft text-accent",
  completed: "bg-good-soft text-good",
  partial: "bg-warn-soft text-warn",
  failed: "bg-bad-soft text-bad",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  const orgId = ctx.organizationId;
  const { id } = await params;

  let project;
  try {
    project = await getProject(orgId, id);
  } catch (err) {
    if (err instanceof ScanError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const [auditRows, org, client] = await Promise.all([
    listProjectAudits(orgId, id),
    getOrganization(orgId),
    project.clientId ? getClient(orgId, project.clientId).catch(() => null) : Promise.resolve(null),
  ]);
  const plan = effectivePlanForOrg(org);
  const writable = canWrite(ctx.role);
  const finished = auditRows.filter((a) => a.status === "completed" || a.status === "partial");

  return (
    <div className="mt-8">
      <Link href="/app" className="text-sm font-semibold text-accent hover:underline">← Overview</Link>
      {client && (
        <span className="text-sm text-ink-mute">
          {" · "}<Link href={`/app/clients/${client.id}`} className="font-semibold text-accent hover:underline">{client.name}</Link>
        </span>
      )}
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{project.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 break-all text-sm text-ink-soft">
          <Globe size={14} className="shrink-0 text-ink-mute" aria-hidden /> {project.siteUrl}
        </p>
        {writable && <AssignClientSelect projectId={project.id} currentClientId={project.clientId} />}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-label="Check history">
          <h2 className="font-semibold">Check history</h2>
          {auditRows.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-mute" role="status">
              No checks yet — run the first one {writable ? "on the right" : "when an admin or member is available"}.
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
                        {idx === 0 ? "Latest check" : "Check"} — <LocalDateTime value={a.createdAt.toISOString()} />
                      </Link>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_CLS[a.status] ?? STATUS_CLS.queued}`}>
                        {a.status}
                      </span>
                      {a.score !== null && (
                        <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold">Score {a.score}/100</span>
                      )}
                      {previous && (a.status === "completed" || a.status === "partial") && (
                        <Link
                          href={`/app/audits/compare?newer=${a.id}&older=${previous.id}`}
                          className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                        >
                          <GitCompareArrows size={14} aria-hidden /> What changed?
                        </Link>
                      )}
                    </div>
                    {a.status === "failed" && a.errorMessage && (
                      <p className="mt-2 text-sm text-bad">{a.errorMessage}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {writable ? (
          <RunAuditForm
            projectId={project.id}
            defaultUrl={project.siteUrl}
            allowedTypes={plan.auditTypes}
            planName={plan.name}
            deepAllowed={plan.deepScans}
          />
        ) : (
          <p className="h-fit rounded-2xl border border-line bg-surface p-6 text-sm text-ink-soft" role="status">
            You have read-only access here, so you can view reports but not run new checks.
          </p>
        )}
      </div>
    </div>
  );
}
