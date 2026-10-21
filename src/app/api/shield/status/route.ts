import { NextResponse } from "next/server";
import { activeBanKeys, getShieldSettings } from "@/lib/services/shield";
import { hasInternalToken } from "@/lib/shield/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Snapshot for the edge middleware: current mode, allowlisted address
 * hashes and active ban hashes. Token-protected and never cached by the
 * CDN (a cached copy would be served to callers without the token).
 */
export async function GET(req: Request) {
  if (!(await hasInternalToken(req))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  try {
    const [settings, bans] = await Promise.all([getShieldSettings(undefined, true), activeBanKeys()]);
    return NextResponse.json(
      { mode: settings.mode, allowed: settings.allow.map((a) => a.hash), banned: bans.ips, at: Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Fail open with defaults; the edge keeps its last good snapshot anyway.
    return NextResponse.json({ mode: "monitor", allowed: [], banned: [], at: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  }
}
