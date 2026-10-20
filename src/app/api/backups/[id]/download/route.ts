import { NextRequest, NextResponse } from "next/server";
import { backupDownloadUrl } from "@/lib/services/backups";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Short-lived (15 min) signed R2 download URL for the raw archive. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const url = await backupDownloadUrl(ctx.organizationId, id, ctx.userId);
    return NextResponse.json({ url, expiresInSec: 900 });
  } catch (err) {
    return apiError(err);
  }
}
