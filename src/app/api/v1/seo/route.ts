import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { runSeoVisibilityEngine } from "@/lib/services/seo-visibility";
import { consumeToolRun } from "@/lib/services/tool-access";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    if (body.consent !== true) {
      throw new ScanError("CONSENT_REQUIRED", "Set consent: true only if you own this website or have permission.");
    }
    const url = typeof body.url === "string" ? body.url : "";
    await consumeToolRun(key.organizationId, "seo-visibility");
    const report = await runSeoVisibilityEngine(url);
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
