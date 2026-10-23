import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSearch } from "lucide-react";
import { getSessionContext, UnauthorizedError } from "@/lib/api";
import { getOrganization } from "@/lib/services/orgs";
import { listRecentAudits } from "@/lib/services/audits";
import { premiumAccess } from "@/lib/services/tool-access";
import { effectivePlanForOrg } from "@/lib/plans";
import { SCAN_MODE_LABELS, isScanMode } from "@/lib/scan-modes";
import QuickScanForm from "@/components/app/QuickScanForm";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-good-soft text-good",
  partial: "bg-warn-soft text-warn",
  failed: "bg-bad-soft text-bad",
  queued: "bg-accent-soft text-accent",
  running: "bg-accent-soft text-accent",
};

/**
 * The Scan tab — the default landing after sign-in. One job only:
 * scan any website without saving it as a project first, then jump
 * back into recent reports. Quick scans still count toward the plan
 * and are saved like project audits.
 */
export default async function ScanTabPage() {
  let ctx;
  try {
    ctx = await getSessionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    throw err;
  }

  const [org, recent, deepAccess] = await Promise.all([
    getOrganization(ctx.organizationId),
    listRecentAudits(ctx.organizationId, 8),
    premiumAccess(ctx.organizationId, "deep-scan"),
  ]);
  const plan = effectivePlanForOrg(org);
  const deepNote = deepAccess.remaining === null
    ? "unlimited"
    : `${deepAccess.limit} ${deepAccess.period === "lifetime" ? "free (lifetime)" : "/month"} · ${deepAccess.remaining} left`;

  return (
    <div className="mt-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Scan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Paste a public address. The report is saved here. Client sites live under Clients.
        </p>
      </header>

      <QuickScanForm planName={plan.name} deepAllowed={deepAccess.allowed} deepNote={deepNote} />

      <section aria-labelledby="recent-scans">
        <h2 id="recent-scans" className="flex items-center gap-2 font-semibold">
          <FileSearch size={17} className="text-accent" aria-hidden /> Recent scans
        </h2>
        {recent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-sm leading-relaxed text-ink-soft">
            No scans yet in this workspace. Run your first one above — the report will appear here and stay saved.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {recent.map(({ audit, findingsCount }) => (
              <li key={audit.id}>
                <Link
                  href={`/app/audits/${audit.id}`}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 sm:px-5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={audit.targetUrl}>
                    {audit.targetUrl}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    {audit.projectId ? "Saved website" : "Quick scan"}
                  </span>
                  <span className="rounded-full border border-accent/30 bg-accent-soft/60 px-2 py-0.5 text-[11px] font-semibold text-accent">
                    {SCAN_MODE_LABELS[isScanMode(audit.scanMode) ? audit.scanMode : "normal"]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[audit.status] ?? "bg-canvas text-ink-soft"}`}>
                    {audit.status}
                  </span>
                  {(audit.status === "completed" || audit.status === "partial") && (
                    <span className="text-xs text-ink-mute">
                      {findingsCount} finding{findingsCount === 1 ? "" : "s"}{audit.score !== null ? ` · score ${audit.score}` : ""}
                    </span>
                  )}
                  <span className="text-xs text-ink-mute">
                    <LocalDateTime value={audit.createdAt.toISOString()} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6" aria-label="Rendered flow scanning">
        <h2 className="flex items-center gap-2 font-semibold">
          Real user-flow scanning
          <span className="rounded-full bg-good px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The scanner above reads pages the way a careful crawler does. <strong className="text-ink">Flow Scan</strong> goes
          further: a real browser renders the site with JavaScript on, probes menus, follows links, and streams every step
          live — with a notes log of anything that breaks along the way. Available on Pro and Ultra Agency plans.
        </p>
        <p className="mt-4">
          <Link href="/app/flow-scan" className="button-primary">Open Flow Scan</Link>
        </p>
      </section>
    </div>
  );
}
