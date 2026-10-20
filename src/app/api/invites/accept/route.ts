import { NextRequest, NextResponse } from "next/server";
import { acceptInvitation } from "@/lib/services/team";
import { apiError, readJsonBody, requireSession, ORG_COOKIE } from "@/lib/api";

export const runtime = "nodejs";

/** Accepts an invitation for the signed-in user (email must match) and switches to that workspace. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = await readJsonBody(req);
    const result = await acceptInvitation(ctx.userId, ctx.email, String(body.token ?? ""));
    const res = NextResponse.json({ ok: true, ...result });
    res.cookies.set(ORG_COOKIE, result.organizationId, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
