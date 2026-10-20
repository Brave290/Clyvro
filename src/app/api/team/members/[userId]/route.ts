import { NextRequest, NextResponse } from "next/server";
import { changeMemberRole, removeMember } from "@/lib/services/team";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";
import { isRole, type Role } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const { userId } = await params;
    const body = await readJsonBody(req);
    const role = String(body.role ?? "") as Role;
    if (!isRole(role)) throw new ScanError("VALIDATION", "Pick a valid role.");
    return NextResponse.json(await changeMemberRole(ctx.organizationId, ctx.userId, ctx.role, userId, role));
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const { userId } = await params;
    await removeMember(ctx.organizationId, ctx.userId, ctx.role, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
