import { NextRequest, NextResponse } from "next/server";
import { apiError, requireManage, requireSession } from "@/lib/api";
import { revokeOrgApiKey } from "@/lib/services/org-api";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const { id } = await params;
    await revokeOrgApiKey(ctx.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
