import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createBridgeToken, neonAuthBaseUrl, neonAuthConfigured, verifyNeonJwt } from "@/lib/neon-auth";
import { findOrCreateOAuthUser } from "@/lib/services/accounts";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Neon Auth → app session bridge.
 *
 * Preferred path (v2): the browser obtains the Neon session JWT from
 * `{NEON_AUTH_BASE_URL}/token` (credentialed cross-site request — the
 * Neon session cookie lives on the Neon domain by design) and posts it
 * here. The JWT is verified server-side against Neon's JWKS (signature +
 * expiry) before the app user is provisioned/linked by verified email
 * and a 5-minute signed bridge token is minted for the Auth.js
 * "neon-bridge" provider.
 *
 * Fallback path: forward the browser's cookies to Neon's get-session
 * (works when Neon cookies were set through our own-domain proxy).
 *
 * Suspended accounts are refused on both paths. When Neon Auth isn't
 * configured this is an honest 501 — email/password keeps working.
 */
export async function POST(request: NextRequest) {
  if (!neonAuthConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_IMPLEMENTED", message: "Neon Auth is not configured yet." } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    let email: string | null = null;
    let name: string | null = null;

    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    if (typeof body?.token === "string" && body.token) {
      const claims = await verifyNeonJwt(body.token);
      if (!claims) throw new Error("bad-token");
      email = claims.email;
      name = claims.name ?? null;
    } else {
      const cookie = request.headers.get("cookie") ?? "";
      const sessionRes = await fetch(`${neonAuthBaseUrl()}/get-session`, {
        headers: { cookie, "x-forwarded-host": request.nextUrl.host },
        cache: "no-store",
      });
      if (!sessionRes.ok) throw new Error("no-session");
      const data = (await sessionRes.json().catch(() => null)) as { user?: { email?: string; name?: string } } | null;
      email = data?.user?.email?.trim().toLowerCase() ?? null;
      name = data?.user?.name ?? null;
      if (!email) throw new Error("no-session");
    }

    const db = await getDb();
    const provisioned = await findOrCreateOAuthUser({ email, name }, db);
    const [user] = await db.select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, provisioned.userId)).limit(1);
    if (user?.suspendedAt) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This account is suspended. Contact support if you think this is a mistake." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { token: createBridgeToken(provisioned.userId, email) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "No Neon Auth session found. Sign in first." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
