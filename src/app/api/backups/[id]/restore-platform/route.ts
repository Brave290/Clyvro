import { NextRequest, NextResponse } from "next/server";
import { applyPlatformRestore } from "@/lib/services/backups";
import { apiError, readJsonBody, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Platform-admin only: restore every workspace in the archive into its own workspace. Requires {confirm:true}. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const body: Record<string, unknown> = await readJsonBody(req).catch(() => ({}));
    if (body.confirm !== true) {
      return NextResponse.json(
        { error: { code: "CONFIRM_REQUIRED", message: "Run the restore preview first, then confirm." } },
        { status: 400 },
      );
    }
    const result = await applyPlatformRestore(id, ctx.userId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
