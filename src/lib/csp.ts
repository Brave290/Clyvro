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

export function buildContentSecurityPolicy(nonce: string, isDev = false): string {
  return [
    "default-src 'self'",
    // Next.js dev (HMR/react-refresh) needs eval; production never does.
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used across the UI (animation delays,
    // progress bars). Style injection can't execute script in modern
    // browsers, so 'unsafe-inline' stays for style only — CLY-105
    // deliberately audits script directives, not this.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
