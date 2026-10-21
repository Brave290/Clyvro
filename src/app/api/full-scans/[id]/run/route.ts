import { NextRequest, NextResponse } from "next/server";
import { runFullScan } from "@/lib/services/full-scan";
import { apiError, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
// Four engines sequentially (browser walk included) — same headroom as Flow Scan.
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
