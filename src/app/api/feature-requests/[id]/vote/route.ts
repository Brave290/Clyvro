import { NextRequest, NextResponse } from "next/server";
import { toggleFeatureVote } from "@/lib/services/feature-requests";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { apiError, requireSession, requireWrite } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** Toggle your upvote on a feature request. Bot-guarded: 60 toggles/hour/account. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    if (!(await tryConsumeUserAction("feature-vote", ctx.userId, 60, 60 * 60 * 1000))) {
      throw new ScanError("RATE_LIMITED", "That's a lot of voting in an hour — take a breather and try again shortly.");
    }
    const { id } = await params;
    const result = await toggleFeatureVote(ctx.organizationId, ctx.userId, id);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
