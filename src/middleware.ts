import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { maintenanceAllows } from "@/lib/services/site-shared";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

/** Protects /app/* (see the authorized callback). Edge-safe config only. */
const { auth } = NextAuth(authConfig);

/**
 * Maintenance gate + /app auth + per-request CSP nonce.
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
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
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
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
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
