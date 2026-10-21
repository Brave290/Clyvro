import { NextRequest, NextResponse } from "next/server";
import { runRepoReview } from "@/lib/services/github-code-review";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { apiError, requireSession, requireWrite } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** Run a whole-repo review now. Bot-guarded: 10 runs/hour/account. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    if (!(await tryConsumeUserAction("repo-review", ctx.userId, 10, 60 * 60 * 1000))) {
      throw new ScanError("RATE_LIMITED", "You've run a lot of repo reviews in the last hour — try again shortly.");
    }
    const { id } = await params;
    const result = await runRepoReview(ctx.organizationId, ctx.userId, id);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
