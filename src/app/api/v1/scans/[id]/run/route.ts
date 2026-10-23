import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { getFullScan, runFullScan } from "@/lib/services/full-scan";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Kick (or finish) a queued Full Scan. The CLI polls GET /scans/:id for live steps meanwhile. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const { id } = await params;
    await runFullScan(key.organizationId, id);
    const row = await getFullScan(key.organizationId, id);
    return NextResponse.json({
      id: row.id, status: row.status, stages: row.stages, steps: row.steps,
      errorMessage: row.errorMessage, finishedAt: row.finishedAt,
    });
  } catch (err) {
    return apiError(err);
  }
}
