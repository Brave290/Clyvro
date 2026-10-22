import { NextRequest, NextResponse } from "next/server";
import { registerAccount } from "@/lib/services/accounts";
import { apiError, clientIp, readJsonBody } from "@/lib/api";
import { recordSignup, signupAllowed } from "@/lib/services/abuse";
import { guardJsonBody } from "@/lib/shield/body";
import { DEVICE_HEADER } from "@/lib/device";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    // Shield scores the payload's text fields (name, organisation, e-mail) with
    // the same signatures as the request line. Passwords are opaque and skipped.
    await guardJsonBody(body, {
      route: "/api/auth/register",
      ip: clientIp(req),
      country: req.headers.get("x-vercel-ip-country"),
      userAgent: req.headers.get("user-agent"),
    });
    // Quietly block bulk free-account creation from the same connection/device.
    const allowed = await signupAllowed(clientIp(req), req.headers.get(DEVICE_HEADER));
    if (!allowed) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "We couldn't create your account. If you already have one, please sign in instead." } },
        { status: 403 },
      );
    }
    const result = await registerAccount({
      name: typeof body.name === "string" ? body.name : undefined,
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      organizationName: typeof body.organizationName === "string" ? body.organizationName : undefined,
    });
    await recordSignup(clientIp(req), req.headers.get(DEVICE_HEADER));
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
