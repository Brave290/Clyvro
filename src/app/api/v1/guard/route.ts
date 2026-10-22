import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { inspectRequest, decide } from "@/lib/shield/rules";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/**
 * Site Guard — Pro/Agency. Put this in front of your own site.
 * Same inspector Clyvro uses on itself (honeypots, tool UAs, signatures).
 * Returns allow or block. Does not run attacks.
 */
export async function POST(req: NextRequest) {
  try {
    await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    const method = typeof body.method === "string" ? body.method : "GET";
    const pathname = typeof body.path === "string" ? body.path : "/";
    if (!pathname.startsWith("/") || pathname.length > 2048) {
      throw new ScanError("VALIDATION", "path must be a URL path starting with /.");
    }
    const search = typeof body.search === "string" ? body.search : "";
    const userAgent = typeof body.userAgent === "string" ? body.userAgent : null;
    const inspection = inspectRequest({ method, pathname, search, userAgent });
    const action = decide(inspection, "enforce") === "block" ? "block" : "allow";
    return NextResponse.json({
      action,
      verdict: inspection.verdict,
      reason: inspection.primary,
      score: inspection.score,
      alwaysEnforced: inspection.alwaysEnforced,
    });
  } catch (err) {
    return apiError(err);
  }
}
