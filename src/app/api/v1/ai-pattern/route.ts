import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { runAndSaveAiPattern } from "@/lib/services/ai-pattern";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    if (body.consent !== true) {
      throw new ScanError("CONSENT_REQUIRED", "Set consent: true only if you own this website or have permission.");
    }
    const domain = typeof body.url === "string" ? body.url : typeof body.domain === "string" ? body.domain : "";
    const result = await runAndSaveAiPattern(key.organizationId, key.userId, domain);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
