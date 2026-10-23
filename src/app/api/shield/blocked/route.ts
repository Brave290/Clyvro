import { NextResponse, after } from "next/server";
import { createThrottle } from "@/lib/throttle";
import { SHIELD_HEADERS } from "@/lib/shield/edge";
import { shieldBlockHttpStatus, type Match, type ShieldMode } from "@/lib/shield/rules";
import { escalate, recordEvent, type EventVerdict } from "@/lib/services/shield";
import { maybeActivateEmergencyOverride } from "@/lib/services/emergency-override";
import { hasInternalToken } from "@/lib/shield/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_CONTACT = process.env.SECURITY_CONTACT_EMAIL || "admin.founda@gmail.com";

/**
 * Event sampling: a flood must never turn into a flood of database writes.
 * Signature/honeypot blocks: up to 20 rows per address per minute; rate-limit
 * and banned hits: one row per address per 30 s; plus a per-instance cap.
 */
const blockedSampler = createThrottle({ windowMs: 60_000, limit: 20 });
const floodSampler = createThrottle({ windowMs: 30_000, limit: 1 });
const globalSampler = createThrottle({ windowMs: 60_000, limit: 120 });

/**
 * Every request the edge middleware blocks is rewritten here. We answer
 * fast (429 rate-limit, 404 honeypot, 403 otherwise) and record + escalate
 * after the response has been sent. Direct hits without the internal token
 * get a plain 404 so the endpoint reveals nothing.
 */
async function handle(req: Request) {
  if (!(await hasInternalToken(req))) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
  const h = req.headers;
  const reason = h.get(SHIELD_HEADERS.reason) ?? "blocked";
  const mode = (h.get(SHIELD_HEADERS.mode) ?? "monitor") as ShieldMode;
  const ipHash = h.get(SHIELD_HEADERS.ipHash) ?? "";
  const ipMasked = h.get(SHIELD_HEADERS.ipMasked) ?? "unknown";
  const method = h.get(SHIELD_HEADERS.method) ?? req.method;
  const path = safeDecode(h.get(SHIELD_HEADERS.path)) || new URL(req.url).pathname;
  const userAgent = safeDecode(h.get(SHIELD_HEADERS.userAgent)) || null;
  const country = h.get(SHIELD_HEADERS.country);
  const score = Number(h.get(SHIELD_HEADERS.score) ?? 0) || 0;
  const retryAfter = Number(h.get(SHIELD_HEADERS.retryAfter) ?? 0) || 0;
  let matches: Match[] = [];
  try { matches = JSON.parse(safeDecode(h.get(SHIELD_HEADERS.matches)) || "[]") as Match[]; } catch { matches = []; }

  const verdict: EventVerdict = reason === "banned" ? "banned" : reason === "rate-limit" ? "rate-limited" : "blocked";
  const sampler = verdict === "blocked" ? blockedSampler : floodSampler;
  if (ipHash && !sampler.hit(ipHash) && !globalSampler.hit("all")) {
    after(async () => {
      await recordEvent({ ipHash, ipMasked, country, method, path, userAgent, verdict, rule: reason, matches, score, mode });
      // CSRF blocks are not escalated: the "attacker" is a victim's browser
      // on a hostile page, and banning it would hand attackers a DoS tool.
      if (verdict !== "banned" && reason !== "csrf") await escalate(ipHash, ipMasked, reason);
      await maybeActivateEmergencyOverride();
    });
  }

  const status = shieldBlockHttpStatus(reason);
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": csp,
  };
  if (status !== 404) headers["X-Clyvro-Shield"] = verdict;
  if (status === 429) headers["Retry-After"] = String(Math.max(retryAfter, 30));

  if (status === 404) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status, headers });
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>404: This page could not be found.</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fff;color:#111}main{text-align:center}h1{font-size:1.5rem}</style></head><body><main><h1>404</h1><p>This page could not be found.</p></main></body></html>`;
    return new NextResponse(html, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }

  const message = status === 429
    ? "Too many requests from your network. Please slow down and try again shortly."
    : `This request was blocked by Clyvro Shield. If you believe this is a mistake, contact ${SECURITY_CONTACT} with the time of the request.`;

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: { code: status === 429 ? "RATE_LIMITED" : "FORBIDDEN", message } }, { status, headers });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${status === 429 ? "Slow down" : "Request blocked"} · Clyvro</title><style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:36rem;padding:2rem;text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#9ca3af;line-height:1.5}code{color:#93c5fd}</style></head><body><main><h1>${status === 429 ? "Too many requests" : "Request blocked"}</h1><p>${message}</p><p><code>Clyvro Shield · ${verdict}</code></p></main></body></html>`;
  return new NextResponse(html, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

function safeDecode(value: string | null): string {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
