/**
 * Clyvro Shield — 404-burst detection.
 *
 * Content scanners do not only try `.env` and `wp-login.php`; the noisy ones
 * walk a dictionary of paths and look at what comes back. Every miss costs
 * them a request, but nothing in Shield used to notice the *shape* of that
 * traffic (the page rate class only slows it down).
 *
 * `noteMiss()` is a tiny per-instance sliding window: a handful of 404s an
 * hour is a person with a stale bookmark, a burst is a scanner. When a burst
 * crosses the line, `noteNotFound()` records one Shield event and lets the
 * normal ban ladder take over (a `404-burst` reason floors at the 15-minute
 * rung, so a scanner is cooled off after the first sustained burst instead of
 * being ignored). Reporting is sampled to one row per address per minute.
 *
 * Limits, honestly: this only sees *page* 404s (API misses answer JSON from
 * their own handlers) and, like every edge counter, it is per instance — a
 * distributed scan spread across instances is slowed, not stopped.
 */
import { clientAddress, createThrottle } from "@/lib/throttle";
import { hashIp, maskIp } from "./rules";
import { escalate, getShieldSettings, recordEvent } from "@/lib/services/shield";

export const MISS_WINDOW_MS = 60_000;
/** 404s from one address in the window before it counts as a burst. */
export const MISS_BURST_LIMIT = 12;

const misses = createThrottle({ windowMs: MISS_WINDOW_MS, limit: MISS_BURST_LIMIT, maxKeys: 20_000 });
const reports = createThrottle({ windowMs: 60_000, limit: 1, maxKeys: 20_000 });

export type MissOutcome = "ok" | "burst" | "reported";

/**
 * Records one 404 for an address.
 *  - `ok`       under the burst limit
 *  - `burst`    over the limit, but this address was already reported in the last minute
 *  - `reported` over the limit and due a fresh event
 */
export function noteMiss(ipHash: string, now = Date.now()): MissOutcome {
  if (!misses.hit(ipHash, now)) return "ok";
  return reports.hit(ipHash, now) ? "burst" : "reported";
}

/**
 * Called by `app/not-found.tsx`. Best-effort and never throws: a 404 page must
 * render even when Shield cannot be reached.
 */
export async function noteNotFound(): Promise<void> {
  try {
    // Imported lazily: this module is also imported by pure unit tests, where
    // the Next request store does not exist.
    const { headers } = await import("next/headers");
    const h = await headers();
    const ip = clientAddress(h);
    const ipHash = await hashIp(ip, process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me");
    if (noteMiss(ipHash) !== "reported") return;
    const path = h.get("x-clyvro-path") ?? "/";
    const mode = (await getShieldSettings().catch(() => null))?.mode ?? "monitor";
    await recordEvent({
      ipHash,
      ipMasked: maskIp(ip),
      country: h.get("x-vercel-ip-country"),
      method: h.get("x-clyvro-method") ?? "GET",
      path: `404 ${path}`.slice(0, 400),
      userAgent: h.get("user-agent"),
      verdict: "blocked",
      rule: "404-burst",
      matches: [],
      score: 0,
      mode,
    });
    await escalate(ipHash, maskIp(ip), "404-burst");
  } catch {
    /* a missing page must never fail because logging did */
  }
}
