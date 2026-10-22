import { NextRequest, NextResponse } from "next/server";
import { resetPassword } from "@/lib/services/password-resets";
import { apiError, clientIp, readJsonBody } from "@/lib/api";
import { guardJsonBody } from "@/lib/shield/body";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    await guardJsonBody(body, {
      route: "/api/auth/reset-password",
      ip: clientIp(req),
      country: req.headers.get("x-vercel-ip-country"),
      userAgent: req.headers.get("user-agent"),
    });
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    await resetPassword(token, password);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
