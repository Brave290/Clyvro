import { NextRequest, NextResponse } from "next/server";
import { getCodeReview } from "@/lib/services/code-review";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** One saved code review (findings only — source was never stored). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const review = await getCodeReview(ctx.organizationId, id);
    return NextResponse.json({ review });
  } catch (err) {
    return apiError(err);
  }
}
