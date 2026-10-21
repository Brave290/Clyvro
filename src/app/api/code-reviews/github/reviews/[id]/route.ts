import { NextRequest, NextResponse } from "next/server";
import { getRepoReview } from "@/lib/services/github-code-review";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** One saved whole-repo review, in full (the detailed scan view). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    return NextResponse.json({ review: await getRepoReview(ctx.organizationId, id) });
  } catch (err) {
    return apiError(err);
  }
}
