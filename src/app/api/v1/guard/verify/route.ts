import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { verifyChallengeToken } from "@/lib/services/challenge";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    const token = typeof body.token === "string" ? body.token : "";
    try {
      const data = verifyChallengeToken(token, key.organizationId);
      return NextResponse.json({ ok: true, path: data.path });
    } catch {
      throw new ScanError("VALIDATION", "That challenge token is not valid or has expired.");
    }
  } catch (err) {
    return apiError(err);
  }
}
