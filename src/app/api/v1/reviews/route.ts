import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { listCodeReviews, saveThoroughReview } from "@/lib/services/code-review";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { ScanError } from "@/lib/scanner/types";
import type { ThoroughReport } from "@/lib/code-review-thorough";

export const runtime = "nodejs";

/**
 * CLI/MCP thorough Code Reviewer. POST saves findings only (never source).
 * GET lists recent reviews for this workspace.
 */
export async function GET(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const history = await listCodeReviews(key.organizationId, 20);
    return NextResponse.json({ history });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    if (!(await tryConsumeUserAction("code-review", key.userId, 30, 60 * 60 * 1000))) {
      throw new ScanError("RATE_LIMITED", "You've saved a lot of code reviews in the last hour — try again shortly.");
    }
    const body = await readJsonBody(req);
    const { id } = await saveThoroughReview(key.organizationId, key.userId, {
      title: typeof body.title === "string" ? body.title : undefined,
      report: body.report as ThoroughReport,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
