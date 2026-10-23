import { NextRequest, NextResponse } from "next/server";
import { runFullScan } from "@/lib/services/full-scan";
import { apiError, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
// Vercel kills the function at 300s. Stage budgets inside runFullScan must fit under that;
// a hung crawl must never leave the row `running` forever (GET recovers stale rows).
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    await runFullScan(ctx.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
