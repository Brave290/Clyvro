import { NextRequest, NextResponse } from "next/server";
import { createFlowScan, flowScanAccess, listFlowScans } from "@/lib/services/flow-scan";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Rendered flow scans (Pro/Ultra). GET: access + history. POST: create a queued run (execute via /[id]/run). */
export async function GET() {
  try {
    const ctx = await requireSession();
    const [access, history] = await Promise.all([
      flowScanAccess(ctx.organizationId),
      listFlowScans(ctx.organizationId, 10),
    ]);
    return NextResponse.json({ access, history });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const url = typeof body.url === "string" ? body.url : "";
    const created = await createFlowScan(ctx.organizationId, ctx.userId, url);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
