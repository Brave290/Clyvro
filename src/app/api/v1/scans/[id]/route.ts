import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { getFullScan } from "@/lib/services/full-scan";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const { id } = await params;
    const row = await getFullScan(key.organizationId, id);
    return NextResponse.json({
      id: row.id,
      targetUrl: row.targetUrl,
      status: row.status,
      stages: row.stages,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    });
  } catch (err) {
    return apiError(err);
  }
}
