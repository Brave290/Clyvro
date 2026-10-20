import { NextRequest, NextResponse } from "next/server";
import { previewRestore } from "@/lib/services/backups";
import { apiError, requireManage, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Dry-run: exactly what a restore of this backup would insert here. Nothing is written. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const { id } = await params;
    const preview = await previewRestore(ctx.organizationId, id, ctx.userId);
    return NextResponse.json({ preview });
  } catch (err) {
    return apiError(err);
  }
}
