import { NextRequest, NextResponse } from "next/server";
import { createFullScan, fullScanAccess, listFullScans } from "@/lib/services/full-scan";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Full Scans (Pro/Ultra bundle). GET: access + history. POST: create a queued run (execute via /[id]/run). */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const url = new URL(req.url);
    const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
    const [access, history] = await Promise.all([
      fullScanAccess(ctx.organizationId),
      listFullScans(ctx.organizationId, 10, undefined, page),
    ]);
    return NextResponse.json({ access, ...history });
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
    const created = await createFullScan(ctx.organizationId, ctx.userId, url);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
