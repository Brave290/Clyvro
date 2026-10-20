import { NextResponse } from "next/server";
import { detailToScanReport, getAuditDetail } from "@/lib/services/audits";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Poll-friendly audit state: status + full report once finished (with finding ids/status). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId } = await requireSession();
    const { id } = await params;
    const detail = await getAuditDetail(organizationId, id);
    return NextResponse.json({
      audit: {
        id: detail.audit.id,
        projectId: detail.audit.projectId,
        status: detail.audit.status,
        targetUrl: detail.audit.targetUrl,
        auditTypes: detail.audit.auditTypes,
        createdAt: detail.audit.createdAt.toISOString(),
        startedAt: detail.audit.startedAt?.toISOString() ?? null,
        finishedAt: detail.audit.finishedAt?.toISOString() ?? null,
      },
      report: ["completed", "partial", "failed"].includes(detail.audit.status)
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
