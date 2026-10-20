import { NextRequest, NextResponse } from "next/server";
import { startAudit } from "@/lib/services/audits";
import { enqueueScanJob } from "@/lib/jobs";
import { apiError, readJsonBody, requireSession } from "@/lib/api";
import { AUDIT_TYPES, type AuditType } from "@/lib/plans";

export const runtime = "nodejs";

const VALID_TYPES = new Set(AUDIT_TYPES.map((t) => t.id));

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, organizationId } = await requireSession();
    const { id: projectId } = await params;
    const body = await readJsonBody(req);
    const auditTypes = Array.isArray(body.auditTypes)
      ? (body.auditTypes.filter((t): t is AuditType => typeof t === "string" && VALID_TYPES.has(t as AuditType)))
      : undefined;
    const { auditId } = await startAudit(organizationId, userId, projectId, {
      url: typeof body.url === "string" ? body.url : undefined,
      auditTypes,
    });
    await enqueueScanJob(auditId);
    return NextResponse.json({ auditId, status: "queued" }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
