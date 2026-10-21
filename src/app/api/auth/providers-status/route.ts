import { NextResponse } from "next/server";
import { authProvidersStatus } from "@/lib/firebase-auth";

export const runtime = "nodejs";

/** Which sign-in methods are actually live (booleans + the PUBLIC Firebase web config — no secrets). */
export async function GET() {
  return NextResponse.json(authProvidersStatus(), { headers: { "Cache-Control": "no-store" } });
}
