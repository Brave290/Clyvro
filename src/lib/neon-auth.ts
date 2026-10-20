import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from "node:crypto";

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
  /** Public Neon Auth base URL (not a secret) so the browser can complete the session handoff. */
  neonAuthBaseUrl: string | null;
}

export function authProvidersStatus(): AuthProvidersStatus {
  return {
    credentials: true,
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    neonAuth: neonAuthConfigured(),
    neonAuthBaseUrl: neonAuthConfigured() ? neonAuthBaseUrl() : null,
  };
}

/* ---------------- Neon session JWT verification ---------------- */

/**
 * Why JWTs, not cookies: after OAuth, the Neon session cookie lives on
 * the Neon Auth domain (SameSite=None by design), so this app's server
 * can never see it. The documented Neon flow issues a session JWT
 * (fetched by the browser from `{base}/token` with credentials); this
 * verifier checks it server-side against Neon's JWKS (`{base}/jwks`) —
 * signature + expiry — before any account is provisioned or linked.
 * Nothing about the client-supplied token is trusted pre-verification.
 */
export interface NeonJwtClaims { sub: string; email: string; name?: string }

interface JwkLike { kid?: string; kty: string; [key: string]: unknown }

let jwksCache: { keys: JwkLike[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 5 * 60 * 1000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchNeonJwks(fetchImpl: FetchLike = fetch, now = Date.now()): Promise<JwkLike[]> {
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetchImpl(`${neonAuthBaseUrl()}/jwks`, { cache: "no-store" });
  if (!res.ok) throw new Error("jwks-unavailable");
  const data = (await res.json()) as { keys?: JwkLike[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

const b64urlJson = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

/** Verify a Neon Auth session JWT. Returns claims or null (never throws). */
export async function verifyNeonJwt(
  token: string,
  deps: { jwks?: JwkLike[]; fetchImpl?: FetchLike; now?: number } = {},
): Promise<NeonJwtClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = b64urlJson(headerPart);
    const payload = b64urlJson(payloadPart);
    const nowSec = Math.floor((deps.now ?? Date.now()) / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= nowSec) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;

    const keys = deps.jwks ?? (await fetchNeonJwks(deps.fetchImpl));
    const key = keys.find((k) => !header.kid || k.kid === header.kid) ?? keys[0];
    if (!key) return null;

    const publicKey = createPublicKey({ key: key as never, format: "jwk" });
    const signed = Buffer.from(`${headerPart}.${payloadPart}`);
    const signature = Buffer.from(signaturePart, "base64url");
    const alg = String(header.alg ?? "");
    let ok = false;
    if (alg === "EdDSA") {
      ok = cryptoVerify(null, signed, publicKey, signature);
    } else if (alg.startsWith("RS") || alg.startsWith("PS")) {
      const hash = alg.endsWith("384") ? "RSA-SHA384" : alg.endsWith("512") ? "RSA-SHA512" : "RSA-SHA256";
      ok = cryptoVerify(hash, signed, publicKey, signature);
    } else if (alg.startsWith("ES")) {
      const hash = alg.endsWith("384") ? "SHA384" : alg.endsWith("512") ? "SHA512" : "SHA256";
      ok = cryptoVerify(hash, signed, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
    } else {
      return null;
    }
    if (!ok) return null;
    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    return null;
  }
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
