import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { getFlowScan, runFlowScan } from "@/lib/services/flow-scan";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const { id } = await params;
    await runFlowScan(key.organizationId, id);
    const row = await getFlowScan(key.organizationId, id);
    return NextResponse.json({
      id: row.id, status: row.status, steps: row.steps, report: row.report,
      errorMessage: row.errorMessage, finishedAt: row.finishedAt,
    });
  } catch (err) {
    return apiError(err);
  }
}
