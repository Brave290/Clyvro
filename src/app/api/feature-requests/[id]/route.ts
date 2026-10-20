import { NextRequest, NextResponse } from "next/server";
import { setFeatureStatus } from "@/lib/services/feature-requests";
import { apiError, readJsonBody, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Platform-admin only: set a request's lifecycle status. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const body = await readJsonBody(req);
    await setFeatureStatus(ctx.userId, id, typeof body.status === "string" ? body.status : "");
    return NextResponse.json({ updated: true });
  } catch (err) {
    return apiError(err);
  }
}
