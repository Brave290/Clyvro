import { NextResponse } from "next/server";
import { apiError, clientIp, readJsonBody } from "@/lib/api";
import { createThrottle } from "@/lib/throttle";
import { emergencyKeyConfigured, emergencyLogin, trustCookieAttributes } from "@/lib/services/trust";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hidden emergency door for platform administrators (see /emergency).
 * Shield-exempt by design, so it carries its own hard limits: an
 * in-memory throttle per address and a global one (per instance), plus
 * the database-backed emergency counter inside `emergencyLogin`. Every
 * attempt is written to the security log.
 */
const perIp = createThrottle({ windowMs: 15 * 60_000, limit: 10 });
const global = createThrottle({ windowMs: 60 * 60_000, limit: 60 });

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET() {
  return NextResponse.json({ keyConfigured: emergencyKeyConfigured() }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (perIp.hit(ip) || global.hit("all")) {
      throw new ScanError("RATE_LIMITED", "Too many emergency attempts. Wait 15 minutes and try again.");
    }
    const body = await readJsonBody(req, 4_096);
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const result = await emergencyLogin({
      email: str(body.email, 254),
      password: str(body.password, 256),
      key: str(body.key, 256),
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    });
    const res = NextResponse.json({ ok: true, token: result.bridgeToken, unbannedIp: result.unbannedIp }, { headers: NO_STORE });
    res.cookies.set(result.cookie.name, result.cookie.value, { ...trustCookieAttributes(), expires: result.cookie.expires, maxAge: result.cookie.maxAge });
    return res;
  } catch (err) {
    const res = apiError(err);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
