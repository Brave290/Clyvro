import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { pollDeviceLogin } from "@/lib/services/cli-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const deviceCode = typeof body.device_code === "string" ? body.device_code : "";
    const result = await pollDeviceLogin(deviceCode);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
