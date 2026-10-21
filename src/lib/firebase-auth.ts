import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from "node:crypto";

/**
 * Firebase Authentication — Google sign-in (founder decision: Firebase
 * replaces Neon Auth for Google; Neon remains only the Postgres host).
 *
 * How it works:
 *  - The browser runs Firebase's Google popup (firebase/auth) using the
 *    PUBLIC web config (`NEXT_PUBLIC_FIREBASE_*`) and posts the resulting
 *    Firebase ID token to `/api/auth/firebase-bridge`.
 *  - The bridge verifies the token server-side against Google's
 *    securetoken JWKS (signature + expiry + `iss` + `aud` for THIS
 *    Firebase project) before any account is provisioned or linked.
 *    Nothing about the client-supplied token is trusted pre-verification.
 *  - Provisioned/linked by verified email via findOrCreateOAuthUser
 *    (identical to the old Google paths — organizations and data
 *    untouched), then a 5-minute signed bridge token is exchanged through
 *    the Auth.js "firebase-bridge" provider for the normal app session.
 *  - Honest states: with no Firebase env set, this is "not configured" —
 *    the button says so and email/password keeps working. Nothing here
 *    ever claims Google is live when it isn't.
 *
 * Founder setup (Firebase Console → Authentication → Sign-in method →
 * Google: Enable; Settings → Authorized domains: clyvro.vercel.app +
 * localhost): put the web config in Vercel as NEXT_PUBLIC_FIREBASE_*
 * (see .env.example) and redeploy.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

/** Public web config from env (NEXT_PUBLIC_FIREBASE_*). Null when unset. */
export function firebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  };
}

/** Firebase project whose ID tokens the server accepts (aud/iss anchor). */
export function firebaseProjectId(): string {
  return (process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim();
}

export function firebaseAuthConfigured(): boolean {
  return Boolean(firebaseProjectId()) && firebaseWebConfig() !== null;
}

export interface AuthProvidersStatus {
  credentials: true;
  /** Auth.js Google provider (legacy direct path; needs AUTH_GOOGLE_* env). */
  google: boolean;
  /** Firebase Authentication (Google) — public web config for the browser popup. */
  firebase: FirebaseWebConfig | null;
}

export function authProvidersStatus(): AuthProvidersStatus {
  return {
    credentials: true,
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    firebase: firebaseAuthConfigured() ? firebaseWebConfig() : null,
  };
}

/* ---------------- Firebase ID-token verification ---------------- */

export interface FirebaseJwtClaims { sub: string; email: string; name?: string }

interface JwkLike { kid?: string; kty: string; [key: string]: unknown }

const SECURETOKEN_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache: { keys: JwkLike[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 5 * 60 * 1000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchFirebaseJwks(fetchImpl: FetchLike = fetch, now = Date.now()): Promise<JwkLike[]> {
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetchImpl(SECURETOKEN_JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("jwks-unavailable");
  const data = (await res.json()) as { keys?: JwkLike[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

const b64urlJson = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

/**
 * Verify a Firebase ID token. Checks RS256 signature against Google's
 * securetoken JWKS, expiry, issuer (`https://securetoken.google.com/<pid>`)
 * and audience (`<pid>`) for the configured project. Returns claims or
 * null (never throws). Email must be present and email_verified must not
 * be explicitly false.
 */
export async function verifyFirebaseIdToken(
  token: string,
  deps: { jwks?: JwkLike[]; fetchImpl?: FetchLike; now?: number; projectId?: string } = {},
): Promise<FirebaseJwtClaims | null> {
  try {
    const projectId = (deps.projectId ?? firebaseProjectId()).trim();
    if (!projectId) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = b64urlJson(headerPart);
    const payload = b64urlJson(payloadPart);
    const nowSec = Math.floor((deps.now ?? Date.now()) / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= nowSec) return null;
    if (typeof payload.iat !== "number" || payload.iat > nowSec + 300) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (payload.aud !== projectId) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    if (payload.email_verified === false) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (String(header.alg ?? "") !== "RS256") return null;

    const keys = deps.jwks ?? (await fetchFirebaseJwks(deps.fetchImpl));
    const key = keys.find((k) => !header.kid || k.kid === header.kid) ?? keys[0];
    if (!key) return null;

    const publicKey = createPublicKey({ key: key as never, format: "jwk" });
    const signed = Buffer.from(`${headerPart}.${payloadPart}`);
    const signature = Buffer.from(signaturePart, "base64url");
    const ok = cryptoVerify("RSA-SHA256", signed, publicKey, signature);
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

/** Short-lived, single-purpose token: Firebase-verified identity → app session. */
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
