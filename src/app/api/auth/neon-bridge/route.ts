import { NextRequest, NextResponse } from "next/server";
import { createBridgeToken, neonAuthBaseUrl, neonAuthConfigured } from "@/lib/neon-auth";
import { findOrCreateOAuthUser } from "@/lib/services/accounts";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * Neon Auth → app session bridge. Verifies the Neon session server-side
 * (forwarding the browser's Neon cookies to the Neon Auth get-session
 * endpoint), provisions/links the app user by verified email, and returns
 * a 5-minute signed bridge token for the Auth.js "neon-bridge" provider.
 * Suspended accounts are refused here too. When Neon Auth isn't
 * configured this is an honest 501 — email/password sign-in keeps working.
 */
export async function POST(request: NextRequest) {
  if (!neonAuthConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_IMPLEMENTED", message: "Neon Auth is not configured yet." } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const cookie = request.headers.get("cookie") ?? "";
    const sessionRes = await fetch(`${neonAuthBaseUrl()}/get-session`, {
      headers: { cookie, "x-forwarded-host": request.nextUrl.host },
      cache: "no-store",
    });
    if (!sessionRes.ok) throw new Error("no-session");
    const data = (await sessionRes.json().catch(() => null)) as { user?: { email?: string; name?: string } } | null;
    const email = data?.user?.email?.trim().toLowerCase();
    if (!email) throw new Error("no-session");

    const db = await getDb();
    const provisioned = await findOrCreateOAuthUser({ email, name: data?.user?.name }, db);
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
