import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSearch } from "lucide-react";
import { getSessionContext, UnauthorizedError } from "@/lib/api";
import { listWorkspaceAudits } from "@/lib/services/audits";
import { SCAN_MODE_LABELS, isScanMode } from "@/lib/scan-modes";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-good-soft text-good",
  partial: "bg-warn-soft text-warn",
  failed: "bg-bad-soft text-bad",
  queued: "bg-accent-soft text-accent",
  running: "bg-accent-soft text-accent",
};

export default async function AuditsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  let ctx;
  try {
    ctx = await getSessionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    throw err;
  }
  const { page: raw } = await searchParams;
  const page = Number.parseInt(raw ?? "1", 10);
  const { rows, page: current, pageCount, total } = await listWorkspaceAudits(ctx.organizationId, Number.isFinite(page) ? page : 1, 20);

  return (
    <div className="mt-8">
      <Link href="/app/scan" className="text-xs font-semibold text-accent hover:underline">← Back to Scan</Link>
      <header className="mt-3">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <FileSearch size={18} className="text-accent" aria-hidden /> Scan history
        </h1>
        <p className="mt-1 text-xs text-ink-mute">{total} saved check{total === 1 ? "" : "s"}</p>
      </header>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-surface p-5 text-sm text-ink-soft">No scans yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map(({ audit, findingsCount }) => (
            <li key={audit.id}>
              <Link
                href={`/app/audits/${audit.id}`}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] transition hover:bg-canvas"
              >
                <span className="min-w-0 flex-1 truncate font-semibold" title={audit.targetUrl}>{audit.targetUrl}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                  {audit.projectId ? "Saved website" : "Quick scan"}
                </span>
                <span className="rounded-full border border-accent/30 bg-accent-soft/60 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {SCAN_MODE_LABELS[isScanMode(audit.scanMode) ? audit.scanMode : "normal"]}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[audit.status] ?? "bg-canvas text-ink-soft"}`}>
                  {audit.status}
                </span>
                {(audit.status === "completed" || audit.status === "partial") && (
                  <span className="text-[11px] text-ink-mute">
                    {findingsCount} finding{findingsCount === 1 ? "" : "s"}{audit.score !== null ? ` · ${audit.score}` : ""}
                  </span>
                )}
                <span className="text-[11px] text-ink-mute"><LocalDateTime value={audit.createdAt.toISOString()} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-xs font-semibold" aria-label="History pages">
          {current > 1 ? <Link href={`/app/audits?page=${current - 1}`} className="text-accent hover:underline">Previous</Link> : <span className="text-ink-mute">Previous</span>}
          <span className="text-ink-mute">{current} / {pageCount}</span>
          {current < pageCount ? <Link href={`/app/audits?page=${current + 1}`} className="text-accent hover:underline">Next</Link> : <span className="text-ink-mute">Next</span>}
        </nav>
      )}
    </div>
  );
}
