import { NextResponse } from "next/server";
import { publicScanStats } from "@/lib/services/public-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await publicScanStats(), {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json(
      { error: "Live scan totals are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
