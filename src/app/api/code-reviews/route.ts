import { NextRequest, NextResponse } from "next/server";
import { listCodeReviews, runAndSaveCodeReview } from "@/lib/services/code-review";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";
import type { CodeLanguage } from "@/lib/code-review-shared";

export const runtime = "nodejs";

const LANGUAGES: CodeLanguage[] = ["auto", "javascript", "typescript", "python", "php", "go", "other"];

/** Code Reviewer v1. GET: history. POST: analyse pasted code (30/hour/account bot guard). Source is never stored. */
export async function GET() {
  try {
    const ctx = await requireSession();
    const history = await listCodeReviews(ctx.organizationId, 10);
    return NextResponse.json({ history });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    if (!(await tryConsumeUserAction("code-review", ctx.userId, 30, 60 * 60 * 1000))) {
      throw new ScanError("RATE_LIMITED", "You've run a lot of code reviews in the last hour — try again shortly.");
    }
    const body = await readJsonBody(req);
    const result = await runAndSaveCodeReview(ctx.organizationId, ctx.userId, {
      title: typeof body.title === "string" ? body.title : undefined,
      language: LANGUAGES.includes(body.language as CodeLanguage) ? (body.language as CodeLanguage) : "auto",
      code: typeof body.code === "string" ? body.code : "",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
