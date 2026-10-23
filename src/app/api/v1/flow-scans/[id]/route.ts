import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { getFlowScan } from "@/lib/services/flow-scan";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const { id } = await params;
    const row = await getFlowScan(key.organizationId, id);
    return NextResponse.json({
      id: row.id, targetUrl: row.targetUrl, status: row.status,
      report: row.report, errorMessage: row.errorMessage,
      createdAt: row.createdAt, finishedAt: row.finishedAt,
    });
  } catch (err) {
    return apiError(err);
  }
}
