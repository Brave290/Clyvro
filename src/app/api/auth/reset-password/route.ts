import { NextRequest, NextResponse } from "next/server";
import { resetPassword } from "@/lib/services/password-resets";
import { apiError, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    await resetPassword(token, password);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
