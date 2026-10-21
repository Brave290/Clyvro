import { NextRequest, NextResponse } from "next/server";
import { getFlowScan } from "@/lib/services/flow-scan";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** One flow scan with its live step log (the UI polls this during a run). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const scan = await getFlowScan(ctx.organizationId, id);
    return NextResponse.json({ scan });
  } catch (err) {
    return apiError(err);
  }
}
