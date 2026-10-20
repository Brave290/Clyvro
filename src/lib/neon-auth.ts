import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Neon Auth (Managed Better Auth) transition layer.
 *
 * Why this exists: the founder wants authentication — Google sign-in
 * included — provided by Neon Auth, with provider credentials managed in
 * the Neon Console instead of Google keys in Vercel. The official SDK
 * (@neondatabase/auth 0.4–0.6 beta) declares `next >= 16`; this app runs
 * Next 15, so the SDK cannot be installed safely yet. This module is the
 * SDK-free transition path:
 *
 *  - `NEON_AUTH_BASE_URL` (provided by the Neon Vercel integration) turns
 *    Neon Auth "configured" on. Google uses Neon's shared development
 *    credentials immediately; production uses the founder's own Google
 *    app configured IN THE NEON CONSOLE (redirect URI:
 *    {NEON_AUTH_BASE_URL}/callback/google) — never in Vercel.
 *  - `/api/neon-auth/[...path]` proxies auth calls on our own domain.
 *  - After Neon establishes a session, `/api/auth/neon-bridge` verifies
 *    it server-side and mints a short-lived signed bridge token; the
 *    Auth.js "neon-bridge" provider exchanges it for the normal app
 *    session. Existing users are matched by verified email (the same
 *    provisioning as Google sign-in), organizations and data untouched.
 *  - Auth.js credentials remain the fallback until the Neon path is
 *    verified live; rollback = remove NEON_AUTH_BASE_URL.
 *
 * Nothing here claims Neon Auth is live: `authProvidersStatus()` reports
 * exactly what is configured, and the UI says so.
 */

export function neonAuthConfigured(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL?.trim());
}

export function neonAuthBaseUrl(): string {
  return (process.env.NEON_AUTH_BASE_URL ?? "").replace(/\/+$/, "");
}

export interface AuthProvidersStatus {
  credentials: true;
  /** Auth.js Google provider (legacy path; needs AUTH_GOOGLE_* env). */
  google: boolean;
  /** Neon Auth (Managed Better Auth) configured via NEON_AUTH_BASE_URL. */
  neonAuth: boolean;
}

export function authProvidersStatus(): AuthProvidersStatus {
  return {
    credentials: true,
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    neonAuth: neonAuthConfigured(),
  };
}

/* ---------------- bridge tokens ---------------- */

const BRIDGE_TTL_MS = 5 * 60 * 1000;

function bridgeSecret(): string {
  return process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", bridgeSecret()).update(payload).digest("base64url");
}

/** Short-lived, single-purpose token: Neon-verified identity → app session. */
export function createBridgeToken(userId: string, email: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    uid: userId, email, exp: now + BRIDGE_TTL_MS, nonce: randomBytes(12).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyBridgeToken(token: string, now = Date.now()): { userId: string; email: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; email?: string; exp?: number };
    if (!data.uid || !data.email || !data.exp || data.exp < now) return null;
    return { userId: data.uid, email: data.email };
  } catch {
    return null;
  }
}
