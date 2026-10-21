import { NextResponse, after } from "next/server";
import { createThrottle } from "@/lib/throttle";
import { SHIELD_MODES, type Match, type ShieldMode } from "@/lib/shield/rules";
import { recordEvent } from "@/lib/services/shield";
import { hasInternalToken } from "@/lib/shield/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Keep a noisy address from filling the events table in monitor mode. */
const perAddress = createThrottle({ windowMs: 10 * 60_000, limit: 30 });
const global = createThrottle({ windowMs: 60_000, limit: 300 });

/** Monitor-mode and "suspicious" events reported by the edge (fire-and-forget). */
export async function POST(req: Request) {
  if (!(await hasInternalToken(req))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const ipHash = typeof body.ipHash === "string" ? body.ipHash : "";
  if (!ipHash || perAddress.hit(ipHash) || global.hit("all")) return NextResponse.json({ ok: true, dropped: true });
  const mode = SHIELD_MODES.includes(body.mode as ShieldMode) ? (body.mode as ShieldMode) : "monitor";
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const wouldBlock = body.wouldBlock === true;
  after(() => recordEvent({
    ipHash,
    ipMasked: str(body.ipMasked, 40) ?? "unknown",
    country: str(body.country, 8),
    method: str(body.method, 10) ?? "GET",
    path: str(body.path, 400) ?? "/",
    userAgent: str(body.userAgent, 200),
    verdict: wouldBlock ? "monitored" : "suspicious",
    rule: str(body.reason, 40) ?? "suspicious",
    matches: Array.isArray(body.matches) ? (body.matches.slice(0, 12) as Match[]) : null,
    score: typeof body.score === "number" ? body.score : 0,
    mode,
  }));
  return NextResponse.json({ ok: true });
}
