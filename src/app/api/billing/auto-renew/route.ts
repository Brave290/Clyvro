import { NextResponse } from "next/server";
import { setAutoRenew } from "@/lib/services/billing";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Owners/admins only — cancel Flutterwave auto-renew for this workspace. */
export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const result = await setAutoRenew(ctx.organizationId, ctx.userId, body.enabled === true);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
