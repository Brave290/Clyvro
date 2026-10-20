import { NextResponse } from "next/server";
import { apiError, requireSession, requireWrite } from "@/lib/api";
import { cancelAudit } from "@/lib/services/audits";

export const runtime = "nodejs";

/** Cancel a queued/running scan (never charged). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    return NextResponse.json(await cancelAudit(ctx.organizationId, id));
  } catch (err) {
    return apiError(err);
  }
}
