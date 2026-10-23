import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateSiteKey } from "@/lib/services/org-api";
import { guardAction, mintChallengeToken, verifyChallengeToken } from "@/lib/services/challenge";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

function cors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Headers", "content-type");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const siteKey = typeof body.siteKey === "string" ? body.siteKey : "";
    const origin = req.headers.get("origin");
    let host: string | null = null;
    try { host = origin ? new URL(origin).hostname : null; } catch { host = null; }
    const key = await authenticateSiteKey(siteKey, host);
    if (body.token) {
      try {
        verifyChallengeToken(String(body.token), key.organizationId);
        return cors(req, NextResponse.json({ action: "allow", ok: true }));
      } catch {
        throw new ScanError("VALIDATION", "That check expired. Try again.");
      }
    }
    const method = typeof body.method === "string" ? body.method : "GET";
    const pathname = typeof body.path === "string" ? body.path : "/";
    if (!pathname.startsWith("/") || pathname.length > 2048) {
      throw new ScanError("VALIDATION", "path must start with /.");
    }
    const result = guardAction({
      method, pathname,
      search: typeof body.search === "string" ? body.search : "",
      userAgent: typeof body.userAgent === "string" ? body.userAgent : req.headers.get("user-agent"),
    });
    const challengeToken = result.action === "challenge"
      ? mintChallengeToken({ organizationId: key.organizationId, path: pathname })
      : undefined;
    return cors(req, NextResponse.json({
      action: result.action,
      ...(challengeToken ? { challengeToken } : {}),
    }));
  } catch (err) {
    return cors(req, apiError(err));
  }
}
