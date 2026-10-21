import { NextRequest, NextResponse } from "next/server";
import { neonAuthBaseUrl, neonAuthConfigured } from "@/lib/neon-auth";

export const runtime = "nodejs";

/**
 * App-domain proxy for Neon Auth (Managed Better Auth). Forwards auth
 * calls to NEON_AUTH_BASE_URL so Neon session cookies are managed on our
 * own domain (the same job the official SDK's handler does; the SDK
 * itself needs Next >= 16, this app is on Next 15). Only enabled when
 * NEON_AUTH_BASE_URL is configured — otherwise an honest 501, never a
 * fake auth endpoint.
 */
async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  if (!neonAuthConfigured()) {
    return NextResponse.json(
      { error: { code: "NOT_IMPLEMENTED", message: "Neon Auth is not configured yet (NEON_AUTH_BASE_URL missing)." } },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }
  const target = `${neonAuthBaseUrl()}/${path.join("/")}${request.nextUrl.search}`;
  const headers = new Headers();
  // Origin/Referer must be forwarded: Better Auth validates them on
  // POSTs (sign-in/social included). Without them Neon rejects the
  // request before Google ever sees it.
  for (const name of ["content-type", "cookie", "x-forwarded-for", "origin", "referer", "accept", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Keep Neon Auth's own base URL as the upstream host. Forwarding Clyvro's
  // host/protocol makes Managed Better Auth reject the request as
  // INVALID_HOSTNAME; the browser Origin/Referer above are sufficient for
  // origin checks, while callbackURL is separately checked against Neon’s
  // trusted-domain allowlist.

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    redirect: "manual",
  });

  const response = new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    statusText: upstream.statusText,
  });
  upstream.headers.forEach((value, name) => {
    if (name === "set-cookie") return; // handled below (may be multi-value)
    if (["content-length", "connection", "transfer-encoding"].includes(name)) return;
    response.headers.set(name, value);
  });
  const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    // Re-issue on our domain: strip any Domain attribute, keep the rest.
    response.headers.append("set-cookie", cookie.replace(/;\s*domain=[^;]*/i, ""));
  }
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
