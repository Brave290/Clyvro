import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { startAudit } from "@/lib/services/audits";
import { enqueueScanJob, processScanJobsBounded } from "@/lib/jobs";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";
import { AUDIT_TYPES, type AuditType } from "@/lib/plans";
import { isScanMode } from "@/lib/scan-modes";

export const runtime = "nodejs";
export const maxDuration = 300;

const VALID_TYPES = new Set(AUDIT_TYPES.map((t) => t.id));

/**
 * Quick scan (Scan tab): start a saved audit for any public URL without
 * creating a project/website first. Identical quota, plan and saving
 * rules as project audits — it still counts, it still saves.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { userId, organizationId } = ctx;
    const body = await readJsonBody(req);
    const auditTypes = Array.isArray(body.auditTypes)
      ? (body.auditTypes.filter((t): t is AuditType => typeof t === "string" && VALID_TYPES.has(t as AuditType)))
      : undefined;
    const { auditId } = await startAudit(organizationId, userId, null, {
      url: typeof body.url === "string" ? body.url : undefined,
      auditTypes,
      locale: body.locale,
      scanMode: isScanMode(body.mode) ? body.mode : "normal",
      consent: body.consent === true,
    });
    await enqueueScanJob(auditId);
    after(() => processScanJobsBounded({ maxSlices: 4, maxRuntimeMs: 220_000 }));
    return NextResponse.json({ auditId, status: "queued" }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
