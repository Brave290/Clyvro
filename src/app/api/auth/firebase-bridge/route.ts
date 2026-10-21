import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createBridgeToken, firebaseAuthConfigured, verifyFirebaseIdToken } from "@/lib/firebase-auth";
import { findOrCreateOAuthUser } from "@/lib/services/accounts";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Firebase Auth → app session bridge. The browser completes Google
 * sign-in with Firebase (popup) and posts the Firebase ID token here.
 * The token is verified server-side against Google's securetoken JWKS
 * (signature + expiry + iss + aud for this Firebase project) before the
 * app user is provisioned/linked by verified email and a 5-minute
 * signed bridge token is minted for the Auth.js "firebase-bridge"
 * provider. Suspended accounts are refused. When Firebase isn't
 * configured this is an honest 501 — email/password keeps working.
 */
export async function POST(request: NextRequest) {
  if (!firebaseAuthConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_IMPLEMENTED", message: "Google sign-in via Firebase is not configured yet." } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    if (typeof body?.token !== "string" || !body.token) throw new Error("no-token");
    const claims = await verifyFirebaseIdToken(body.token);
    if (!claims) throw new Error("bad-token");

    const db = await getDb();
    const provisioned = await findOrCreateOAuthUser({ email: claims.email, name: claims.name ?? null }, db);
    const [user] = await db.select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, provisioned.userId)).limit(1);
    if (user?.suspendedAt) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This account is suspended. Contact support if you think this is a mistake." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { token: createBridgeToken(provisioned.userId, claims.email) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "We couldn't verify that Google sign-in. Please try again." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
