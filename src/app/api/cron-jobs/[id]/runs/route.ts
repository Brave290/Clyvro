import { NextRequest, NextResponse } from "next/server";
import { listCronJobRuns } from "@/lib/services/cron-jobs";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Full run history (newest first) with the captured status, headers and body of every run. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const runs = await listCronJobRuns(ctx.organizationId, id);
    return NextResponse.json({ runs }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
