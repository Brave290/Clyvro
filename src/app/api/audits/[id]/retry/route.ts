import { NextResponse, after } from "next/server";
import { apiError, requireSession, requireWrite } from "@/lib/api";
import { retryAudit } from "@/lib/services/audits";
import { processScanJobsBounded } from "@/lib/jobs";

export const runtime = "nodejs";

/** Retry a failed/timed-out/cancelled scan in place (idempotent charging). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const result = await retryAudit(ctx.organizationId, id);
    after(() => processScanJobsBounded({ maxSlices: 8, maxRuntimeMs: 55_000 }));
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
