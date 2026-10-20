import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";
import { deleteScanSchedule, setScanScheduleEnabled } from "@/lib/services/schedules";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    if (typeof body.enabled !== "boolean") throw new ScanError("VALIDATION", "Choose whether to pause or resume the schedule.");
    const { id } = await params;
    return NextResponse.json({ schedule: await setScanScheduleEnabled(ctx.organizationId, id, body.enabled) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const { id } = await params;
    return NextResponse.json({ schedule: await deleteScanSchedule(ctx.organizationId, id) });
  } catch (err) {
    return apiError(err);
  }
}
