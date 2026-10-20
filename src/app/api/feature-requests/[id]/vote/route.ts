import { NextRequest, NextResponse } from "next/server";
import { toggleFeatureVote } from "@/lib/services/feature-requests";
import { apiError, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Toggle your upvote on a feature request. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const result = await toggleFeatureVote(ctx.organizationId, ctx.userId, id);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
