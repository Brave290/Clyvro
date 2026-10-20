import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/services/password-resets";
import { mailConfigured } from "@/lib/mail";
import { readJsonBody } from "@/lib/api";

export const runtime = "nodejs";

// Small in-memory throttle so the endpoint can't be used to mail-bomb
// one inbox (per instance; the per-user single-live-link rule also caps harm).
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();
function throttled(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/**
 * Always answers the same generic success so the response never reveals
 * whether an account exists. (The page separately shows a banner when
 * email sending isn't configured at all — that's config, not account data.)
 */
export async function POST(req: NextRequest) {
  const ok = NextResponse.json(
    { ok: true, mailConfigured: mailConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
  try {
    const body = await readJsonBody(req);
    const email = typeof body.email === "string" ? body.email : "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!email || throttled(`ip:${ip}`, 10) || throttled(`email:${email.toLowerCase()}`, 5)) return ok;
    const origin = req.headers.get("origin") ?? undefined;
    await requestPasswordReset(email, { baseUrl: origin });
  } catch {
    // Generic success either way — never leak account existence.
  }
  return ok;
}
