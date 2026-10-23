import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { DEV_TOOL_IDS, runDevTool, type DevToolId } from "@/lib/services/dev-tools";
import { consumeToolRun, type ToolKey } from "@/lib/services/tool-access";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** ssl | dns | redirects | headers | robots — same five helpers as the app. */
export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    if (body.consent !== true) {
      throw new ScanError("CONSENT_REQUIRED", "Set consent: true only if you own this website or have permission.");
    }
    const tool = typeof body.tool === "string" ? body.tool : "";
    const target = typeof body.target === "string" ? body.target : typeof body.url === "string" ? body.url : "";
    const testPath = typeof body.path === "string" ? body.path : typeof body.testPath === "string" ? body.testPath : undefined;
    if (!DEV_TOOL_IDS.includes(tool as DevToolId)) {
      throw new ScanError("VALIDATION", "Unknown tool. Use ssl, dns, redirects, headers, or robots.");
    }
    await consumeToolRun(key.organizationId, tool as ToolKey);
    const result = await runDevTool(tool as DevToolId, target, testPath);
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
