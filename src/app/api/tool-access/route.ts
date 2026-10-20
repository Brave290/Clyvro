import { NextResponse } from "next/server";
import { toolAccessSummary } from "@/lib/services/tool-access";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Remaining Beta/dev tool runs for the signed-in workspace (UI labels + lock states). */
export async function GET() {
  try {
    const ctx = await requireSession();
    const access = await toolAccessSummary(ctx.organizationId);
    return NextResponse.json({ access }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
