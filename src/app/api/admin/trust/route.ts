import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { apiError, UnauthorizedError } from "@/lib/api";
import { requireAdminUser, logAdmin } from "@/lib/services/admin";
import { getDb } from "@/lib/db";
import { inspectTrustCookie, mintTrustCookie, trustCookieAttributes, TRUST_COOKIE } from "@/lib/services/trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trusted-browser cookie for platform administrators.
 *   GET    → is this browser currently trusted (and until when)?
 *   POST   → mark this browser as trusted for 30 days (Shield bypass on any network)
 *   DELETE → forget this browser only
 * Every call re-checks admin status against the database row.
 */
async function actorOrThrow() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
  return requireAdminUser(session.user.id);
}

export async function GET() {
  try {
    const actor = await actorOrThrow();
    const jar = await cookies();
    const claims = await inspectTrustCookie(jar.get(TRUST_COOKIE)?.value, actor.userId);
    return NextResponse.json({ trusted: !!claims, expiresAt: claims ? new Date(claims.exp).toISOString() : null });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST() {
  try {
    const actor = await actorOrThrow();
    const cookie = await mintTrustCookie(actor.userId);
    const res = NextResponse.json({ trusted: true, expiresAt: cookie.expires.toISOString() });
    res.cookies.set(cookie.name, cookie.value, { ...trustCookieAttributes(), expires: cookie.expires, maxAge: cookie.maxAge });
    await logAdmin(await getDb(), actor, "shield.trust.issue", "browser", actor.userId.slice(0, 8)).catch(() => undefined);
    return res;
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE() {
  try {
    await actorOrThrow();
    const res = NextResponse.json({ trusted: false, expiresAt: null });
    res.cookies.set(TRUST_COOKIE, "", { ...trustCookieAttributes(), maxAge: 0, expires: new Date(0) });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
