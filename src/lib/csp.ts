/**
 * Content-Security-Policy for clyvro.vercel.app itself.
 *
 * Phase-1 finalization (dogfooding CLY-105): our own `script-src`
 * used to carry 'unsafe-inline' because the Next.js runtime injects
 * small inline scripts. The middleware now mints a fresh nonce per
 * request; Next applies it to its injected scripts automatically and
 * the root layout reads it for the one inline script we own (the
 * theme initializer). A nonce an attacker can't predict restores
 * what 'unsafe-inline' disarmed: injected markup still can't run.
 *
 * Google sign-in (Firebase Authentication) is the one third party the
 * page itself loads, and it needs two explicit allowances — see
 * FIREBASE_AUTH_SCRIPT_SOURCES / FIREBASE_AUTH_FRAME_SOURCES. Without
 * them `signInWithPopup` dies silently under this policy: the gapi
 * loader is refused by script-src (Firebase reports auth/internal-error)
 * and the auth-domain iframe is refused because frame-src falls back to
 * default-src 'self' (Firebase waits for a ping that never comes, then
 * reports auth/network-request-failed). Everything else Firebase talks
 * to (identitytoolkit / securetoken) is XHR, already covered by
 * `connect-src https:`; the popup window itself isn't governed by CSP.
 *
 * Pure + isomorphic (middleware is edge runtime — Web Crypto only).
 */

/** Fresh per-request nonce (base64). Edge-safe: no Node APIs. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Google's `gapi` loader. Firebase Auth's popup resolver injects
 * `<script src="https://apis.google.com/js/api.js">` at runtime (no nonce
 * — it's created by the SDK, not by us), then gapi pulls its iframes
 * module from the same host. A host source is the only way to admit it
 * without 'strict-dynamic', which would disarm the nonce model elsewhere.
 */
export const FIREBASE_AUTH_SCRIPT_SOURCES = ["https://apis.google.com"] as const;

/**
 * Frames Google sign-in may open inside our page:
 *  - `https://<authDomain>/__/auth/iframe` — Firebase's hidden relay
 *    iframe that receives the popup's result. Every Firebase project's
 *    default auth domain is `<project>.firebaseapp.com`; a custom one
 *    (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is appended per request by
 *    buildContentSecurityPolicy, never baked in here.
 *  - `https://accounts.google.com` — Google's own account surfaces
 *    (One Tap / FedCM-style prompts render as iframes from here).
 */
export const FIREBASE_AUTH_FRAME_SOURCES = ["https://*.firebaseapp.com", "https://accounts.google.com"] as const;

export interface ContentSecurityPolicyOptions {
  /**
   * NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN. Added to frame-src when it's a
   * custom domain the defaults above don't already cover (e.g.
   * auth.example.com served by Firebase Hosting). Anything that isn't a
   * plain hostname is ignored — env text is never interpolated raw.
   */
  firebaseAuthDomain?: string | null;
}

/** Plain DNS hostname: labels of [a-z0-9-], at least one dot, no scheme/path/port/quotes. */
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * The frame-src source to add for a configured Firebase auth domain, or
 * null when nothing needs adding (unset, malformed, or already matched by
 * a wildcard in FIREBASE_AUTH_FRAME_SOURCES).
 */
export function firebaseAuthDomainSource(authDomain: string | null | undefined): string | null {
  const host = (authDomain ?? "").trim().toLowerCase();
  if (!host || host.length > 253 || !HOSTNAME_RE.test(host)) return null;
  const covered = FIREBASE_AUTH_FRAME_SOURCES.some((source) => {
    const pattern = source.slice("https://".length);
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // ".firebaseapp.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === pattern;
  });
  return covered ? null : `https://${host}`;
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDev = false,
  options: ContentSecurityPolicyOptions = {},
): string {
  const customAuthDomain = firebaseAuthDomainSource(options.firebaseAuthDomain);
  const frameSources = ["'self'", ...FIREBASE_AUTH_FRAME_SOURCES, ...(customAuthDomain ? [customAuthDomain] : [])];
  return [
    "default-src 'self'",
    // Next.js dev (HMR/react-refresh) needs eval; production never does.
    // apis.google.com: Firebase's gapi loader (see FIREBASE_AUTH_SCRIPT_SOURCES).
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} ${FIREBASE_AUTH_SCRIPT_SOURCES.join(" ")}`,
    // Inline style attributes are used across the UI (animation delays,
    // progress bars). Style injection can't execute script in modern
    // browsers, so 'unsafe-inline' stays for style only — CLY-105
    // deliberately audits script directives, not this.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    // Explicit so it no longer inherits default-src 'self' (which blocked
    // the Firebase auth iframe). 'self' keeps the previous behaviour for
    // any same-origin frame; the rest is Google sign-in only.
    `frame-src ${frameSources.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
