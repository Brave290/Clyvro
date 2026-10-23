import { NextResponse } from "next/server";
import { listCodeReviews } from "@/lib/services/code-review";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Code Reviewer history (CLI / GitHub bot). Paste-a-file reviews are gone. */
export async function GET() {
  try {
    const ctx = await requireSession();
    const history = await listCodeReviews(ctx.organizationId, 10);
    return NextResponse.json({ history });
  } catch (err) {
    return apiError(err);
  }
}
