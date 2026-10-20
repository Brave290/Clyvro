import { NextRequest, NextResponse } from "next/server";
import { deleteBackup } from "@/lib/services/backups";
import { apiError, requireManage, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Delete a backup (removes the R2 object and its catalogue row). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const { id } = await params;
    await deleteBackup(ctx.organizationId, id, ctx.userId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
