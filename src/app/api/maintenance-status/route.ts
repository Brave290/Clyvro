import { NextResponse } from "next/server";
import { getMaintenance } from "@/lib/services/site";

export const runtime = "nodejs";

/** Tiny maintenance flag for the edge middleware (short-cached, fail-open upstream). */
export async function GET() {
  const maintenance = await getMaintenance();
  return NextResponse.json(
    { enabled: maintenance.enabled },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
  );
}
