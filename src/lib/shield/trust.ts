/**
 * Clyvro Shield — trusted-browser tokens.
 *
 * An IP allowlist breaks the moment the founder's phone switches networks.
 * A trusted-browser cookie does not: it is an HMAC-signed token (derived
 * from AUTH_SECRET) that Shield accepts as "this is an administrator's
 * browser" regardless of address — bypassing bans, rate limits and
 * signature rules. It is issued only to signed-in platform admins (or by
 * the hidden /emergency door) and every token carries a `version`, so
 * "Revoke all trusted browsers" is one counter bump.
 *
 * Edge-safe: WebCrypto only, no Node imports.
 */

export const TRUST_COOKIE = "clyvro_trust";
export const TRUST_TTL_MS = 30 * 24 * 60 * 60_000;

export interface TrustClaims {
  /** Opaque, non-reversible user reference (short hash). */
  uid: string;
  /** Expiry (ms since epoch). */
  exp: number;
  /** Settings `trustVersion` at issue time. */
  v: number;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(`${secret}|shield-trust`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function issueTrustToken(secret: string, claims: TrustClaims): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ uid: claims.uid, exp: claims.exp, v: claims.v })));
  const sig = await globalThis.crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the claims when the signature is valid, the token is unexpired and the version matches. */
export async function verifyTrustToken(token: string | null | undefined, secret: string, currentVersion: number, now = Date.now()): Promise<TrustClaims | null> {
  if (!token || token.length > 512) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = b64urlDecode(token.slice(dot + 1));
  if (!sig) return null;
  try {
    const ok = await globalThis.crypto.subtle.verify("HMAC", await hmacKey(secret), sig as BufferSource, new TextEncoder().encode(payload));
    if (!ok) return null;
    const raw = b64urlDecode(payload);
    if (!raw) return null;
    const claims = JSON.parse(new TextDecoder().decode(raw)) as Partial<TrustClaims>;
    if (typeof claims.uid !== "string" || typeof claims.exp !== "number" || typeof claims.v !== "number") return null;
    if (claims.exp <= now) return null;
    if (claims.v !== currentVersion) return null;
    return { uid: claims.uid, exp: claims.exp, v: claims.v };
  } catch {
    return null;
  }
}

/** Reads one cookie out of a raw Cookie header without allocating a parser. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
