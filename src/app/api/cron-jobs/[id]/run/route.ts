import { NextRequest, NextResponse } from "next/server";
import { runCronJobNow } from "@/lib/services/cron-jobs";
import { apiError, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Manual trigger — records a run but doesn't shift the regular schedule. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const result = await runCronJobNow(ctx.organizationId, id);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
