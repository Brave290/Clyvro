import { NextResponse } from "next/server";
import { authProvidersStatus } from "@/lib/neon-auth";

export const runtime = "nodejs";

/** Which sign-in methods are actually live (booleans only — no secrets). */
export async function GET() {
  return NextResponse.json(authProvidersStatus(), { headers: { "Cache-Control": "no-store" } });
}
