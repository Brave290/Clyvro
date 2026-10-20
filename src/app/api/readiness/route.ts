import { NextRequest, NextResponse } from "next/server";
import { listReadinessChecks, readinessAccess, runAndSaveReadiness } from "@/lib/services/readiness";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    const ctx = await requireSession();
    const [access, history] = await Promise.all([
      readinessAccess(ctx.organizationId),
      listReadinessChecks(ctx.organizationId, 10),
    ]);
    return NextResponse.json({ access, history });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const domain = typeof body.domain === "string" ? body.domain : "";
    const result = await runAndSaveReadiness(ctx.organizationId, ctx.userId, domain);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
