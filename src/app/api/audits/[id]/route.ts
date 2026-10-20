import { NextResponse, after } from "next/server";
import { detailToScanReport, getAuditDetail } from "@/lib/services/audits";
import { getScanProgress, processScanJobsBounded } from "@/lib/jobs";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Poll-friendly audit state: status + full report once finished (with finding ids/status). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId } = await requireSession();
    const { id } = await params;
    const detail = await getAuditDetail(organizationId, id);
    // While someone is watching a queued/running audit, keep draining scan
    // slices after the response. Without this nudge a deep (Strict) scan
    // needs more slices than the single bounded drain at creation time and
    // would sit "running" until the next audit or the daily cron. Job
    // leases make concurrent drains safe; the work stops when the user
    // leaves and the daily dispatcher finishes whatever is left.
    if (detail.audit.status === "queued" || detail.audit.status === "running") {
      after(() => processScanJobsBounded({ maxSlices: 8, maxRuntimeMs: 55_000 }));
    }
    const progress = await getScanProgress(organizationId, id).catch(() => null);
    return NextResponse.json({
      audit: {
        id: detail.audit.id,
        projectId: detail.audit.projectId,
        status: detail.audit.status,
        targetUrl: detail.audit.targetUrl,
        auditTypes: detail.audit.auditTypes,
        scanMode: detail.audit.scanMode,
        errorCode: detail.audit.errorCode,
        errorMessage: detail.audit.errorMessage,
        createdAt: detail.audit.createdAt.toISOString(),
        startedAt: detail.audit.startedAt?.toISOString() ?? null,
        finishedAt: detail.audit.finishedAt?.toISOString() ?? null,
      },
      progress,
      report: ["completed", "partial", "failed", "timed_out", "cancelled"].includes(detail.audit.status)
        ? detailToScanReport(detail)
        : null,
      findingMeta: Object.fromEntries(
        detail.findings.map((f) => [f.findingKey, { id: f.id, status: f.status }]),
      ),
    });
  } catch (err) {
    return apiError(err);
  }
}
