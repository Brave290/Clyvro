import { NextRequest, NextResponse } from "next/server";
import { DEV_TOOL_IDS, runDevTool, type DevToolId } from "@/lib/services/dev-tools";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Developer Tools (Beta): ssl | dns | redirects | headers | robots. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const tool = typeof body.tool === "string" ? body.tool : "";
    const target = typeof body.target === "string" ? body.target : "";
    const testPath = typeof body.testPath === "string" ? body.testPath : undefined;
    if (!DEV_TOOL_IDS.includes(tool as DevToolId)) {
      return NextResponse.json({ error: { code: "VALIDATION", message: "Unknown developer tool." } }, { status: 400 });
    }
    const result = await runDevTool(tool as DevToolId, target, testPath);
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
