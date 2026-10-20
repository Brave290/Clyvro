import { NextRequest, NextResponse } from "next/server";
import { runSeoVisibilityEngine } from "@/lib/services/seo-visibility";
import { consumeToolRun } from "@/lib/services/tool-access";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** SEO Visibility: indexability + search-appearance check with fix steps. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const url = typeof body.url === "string" ? body.url : "";
    await consumeToolRun(ctx.organizationId, "seo-visibility");
    const report = await runSeoVisibilityEngine(url);
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
