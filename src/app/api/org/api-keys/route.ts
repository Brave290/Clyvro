import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";
import { assertOrgHasSiteApi, createOrgApiKey, listOrgApiKeys } from "@/lib/services/org-api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    await assertOrgHasSiteApi(ctx.organizationId);
    const keys = await listOrgApiKeys(ctx.organizationId);
    return NextResponse.json({ keys });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name : "API key";
    const created = await createOrgApiKey(ctx.organizationId, ctx.userId, name);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
