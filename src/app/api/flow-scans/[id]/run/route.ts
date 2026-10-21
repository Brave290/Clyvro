import { NextRequest, NextResponse } from "next/server";
import { getFlowScan, runFlowScan } from "@/lib/services/flow-scan";
import { apiError, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Execute a queued flow scan (long-running; the UI polls /[id] for live steps meanwhile). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    await runFlowScan(ctx.organizationId, id);
    const scan = await getFlowScan(ctx.organizationId, id);
    return NextResponse.json({ scan });
  } catch (err) {
    return apiError(err);
  }
}
