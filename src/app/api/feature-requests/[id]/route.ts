import { NextRequest, NextResponse } from "next/server";
import { deleteOwnFeatureRequest, setFeatureStatus } from "@/lib/services/feature-requests";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** Platform-admin only: set a request's lifecycle status. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const body = await readJsonBody(req);
    await setFeatureStatus(ctx.userId, id, typeof body.status === "string" ? body.status : "");
    return NextResponse.json({ updated: true });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * Delete your own feature request completely (request + all votes on it).
 * The service scopes the delete to the author, so nobody can remove
 * someone else's request. Bot-guarded like the vote routes.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    if (!(await tryConsumeUserAction("feature-request-delete", ctx.userId, 20, 60 * 60 * 1000))) {
      throw new ScanError("RATE_LIMITED", "That's a lot of deletions in an hour — take a breather and try again shortly.");
    }
    const { id } = await params;
    await deleteOwnFeatureRequest(ctx.userId, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
