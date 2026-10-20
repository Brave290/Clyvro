import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { maintenanceAllows } from "@/lib/services/site-shared";

/** Protects /app/* (see the authorized callback). Edge-safe config only. */
const { auth } = NextAuth(authConfig);

/**
 * Maintenance gate + /app auth. When an admin enables maintenance mode
 * (Admin → Maintenance), public pages redirect to /maintenance. Admin,
 * API routes, sign-in and static assets always stay reachable. The flag
 * is read from a tiny status endpoint (edge-cached ~15s); any failure
 * fails OPEN so a settings hiccup can never take the site down.
 */
export default async function middleware(req: NextRequest) {
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
  // @ts-expect-error Auth.js middleware accepts the request directly.
  return auth(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/maintenance-status).*)"],
};
