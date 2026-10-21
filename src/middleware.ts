import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { maintenanceAllows } from "@/lib/services/site-shared";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";
import { decisionHeaders, evaluateRequest, reportBody, shieldInternalToken } from "@/lib/shield/edge";
import { INTERNAL_HEADER } from "@/lib/shield/rules";

/** Protects /app/* (see the authorized callback). Edge-safe config only. */
const { auth } = NextAuth(authConfig);

/**
 * Clyvro Shield + maintenance gate + /app auth + per-request CSP nonce.
 *
 * Shield runs first (src/lib/shield): in-memory rate classes, bans and
 * request-line signatures decided at the edge; blocked requests are
 * rewritten to /api/shield/blocked (which answers, records and escalates)
 * and monitor-mode hits are reported in the background. Shield is
 * fail-open and never adds a database round-trip to a page view.
 *
 * When an admin enables maintenance mode (Admin → Maintenance), public
 * pages redirect to /maintenance. Admin, API routes, sign-in and static
 * assets always stay reachable. The flag is read from a tiny status
 * endpoint (edge-cached ~15s); any failure fails OPEN so a settings
 * hiccup can never take the site down.
 *
 * The CSP nonce: Next.js reads the nonce out of the request's
 * Content-Security-Policy header and stamps it onto the inline scripts
 * it injects; the root layout reads `x-nonce` for our theme script.
 * Because the nonce differs per request, pages render dynamically —
 * the deliberate price of removing 'unsafe-inline' from script-src
 * (see src/lib/csp.ts).
 */
export default auth(async (req, event) => {
  const { pathname } = req.nextUrl;
  const shieldSecret = process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me";
  const decision = await evaluateRequest(req, shieldSecret);
  if (decision?.action === "block") {
    const url = req.nextUrl.clone();
    url.pathname = "/api/shield/blocked";
    url.search = "";
    const headers = new Headers(req.headers);
    for (const [key, value] of Object.entries(decisionHeaders(decision))) headers.set(key, value);
    headers.set(INTERNAL_HEADER, await shieldInternalToken(shieldSecret));
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (decision?.action === "log") {
    const report = shieldInternalToken(shieldSecret).then((token) => fetch(`${req.nextUrl.origin}/api/shield/report`, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_HEADER]: token },
      body: JSON.stringify(reportBody(decision)),
      signal: AbortSignal.timeout(3_000),
    })).catch(() => undefined);
    // next-auth types the second argument loosely; at runtime it is the NextFetchEvent.
    const fetchEvent = event as unknown as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (typeof fetchEvent?.waitUntil === "function") fetchEvent.waitUntil(report);
  }

  if (!maintenanceAllows(pathname)) {
    try {
      const res = await fetch(`${req.nextUrl.origin}/api/maintenance-status`, {
        headers: { "x-maintenance-check": "1" },
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const status = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
        if (status?.enabled) {
          return NextResponse.redirect(new URL("/maintenance", req.url));
        }
      }
    } catch { /* fail open */ }
  }

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development", {
    // A custom Firebase auth domain must be frameable for Google sign-in;
    // the default <project>.firebaseapp.com is already covered.
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/maintenance-status).*)"],
};
