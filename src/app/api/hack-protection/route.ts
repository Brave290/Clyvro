import { NextRequest, NextResponse } from "next/server";
import { runHackProtectionEngine } from "@/lib/services/hack-protection";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Hack Protection (Beta): safe read-only security posture scan. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const url = typeof body.url === "string" ? body.url : "";
    const report = await runHackProtectionEngine(url);
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
