import { NextRequest, NextResponse } from "next/server";
import { deleteCronJob, setCronJobEnabled } from "@/lib/services/cron-jobs";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const body = await readJsonBody(req);
    await setCronJobEnabled(ctx.organizationId, id, body.enabled === true);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    await deleteCronJob(ctx.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
