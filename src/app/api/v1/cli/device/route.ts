import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { startDeviceLogin } from "@/lib/services/cli-auth";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try {
    const started = await startDeviceLogin();
    return NextResponse.json(started, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
