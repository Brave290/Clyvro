import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";
import { approveDeviceLogin } from "@/lib/services/cli-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const userCode = typeof body.user_code === "string" ? body.user_code : "";
    await approveDeviceLogin(userCode, ctx.organizationId, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
