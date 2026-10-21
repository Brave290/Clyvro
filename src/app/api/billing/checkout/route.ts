import { NextRequest, NextResponse } from "next/server";
import { createCheckout } from "@/lib/services/billing";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Owners/admins only (requireManage) — billing changes are org-level. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const planId = typeof body.planId === "string" ? body.planId : "";
    const country = typeof body.country === "string" ? body.country : undefined;
    const result = await createCheckout(ctx.organizationId, ctx.userId, planId, req.headers, { declaredCountry: country });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
