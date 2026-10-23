import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { guardAction, mintChallengeToken } from "@/lib/services/challenge";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/**
 * Site Guard — Pro/Agency. allow / challenge / block.
 * challenge = branded Clyvro check, not a puzzle captcha.
 */
export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    const method = typeof body.method === "string" ? body.method : "GET";
    const pathname = typeof body.path === "string" ? body.path : "/";
    if (!pathname.startsWith("/") || pathname.length > 2048) {
      throw new ScanError("VALIDATION", "path must be a URL path starting with /.");
    }
    const search = typeof body.search === "string" ? body.search : "";
    const userAgent = typeof body.userAgent === "string" ? body.userAgent : null;
    const result = guardAction({ method, pathname, search, userAgent });
    const challengeToken = result.action === "challenge"
      ? mintChallengeToken({ organizationId: key.organizationId, path: pathname })
      : undefined;
    return NextResponse.json({
      action: result.action,
      verdict: result.verdict,
      reason: result.reason,
      score: result.score,
      alwaysEnforced: result.alwaysEnforced,
      ...(challengeToken ? { challengeToken } : {}),
    });
  } catch (err) {
    return apiError(err);
  }
}
