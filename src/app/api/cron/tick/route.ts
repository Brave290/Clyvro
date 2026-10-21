import { after, NextRequest, NextResponse } from "next/server";
import { claimPublicTick, detectDispatchTrigger, PUBLIC_TICK_COOLDOWN_MS, runDispatcherNow } from "@/lib/services/dispatch";
import { clientAddress, createThrottle } from "@/lib/throttle";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Public, secret-free "tick" for outside schedulers (cron-job.org,
 * UptimeRobot, a phone shortcut — anything that can fetch a URL).
 *
 * Why it is safe without a secret:
 *  - It runs exactly the same bounded dispatcher pass as /api/cron/dispatch
 *    (already-queued scan slices, due schedules, customer cron jobs, the
 *    email outbox, housekeeping). It cannot start scans, change data on
 *    request, or read anything back.
 *  - At most ONE pass per PUBLIC_TICK_COOLDOWN_MS platform-wide, enforced
 *    by an atomic database claim — extra calls get `ran: false` and do
 *    nothing. A per-IP throttle (per instance, memory only) stops floods
 *    before they even reach the database.
 *  - The response carries no diagnostics or secrets.
 *
 * Status codes: 200 for both "ran" and "cooldown" (schedulers should see
 * success), 429 when one address floods it, 503 when the database is
 * unreachable (so a monitor notices).
 */
const perAddress = createThrottle({ windowMs: 60_000, limit: 30 });
let lastClaimedAtMs = 0; // per-instance memo: skip the database inside the cooldown

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: NextRequest) {
  if (perAddress.hit(clientAddress(request.headers))) {
    return NextResponse.json(
      { status: "ok", ran: false, reason: "rate-limited", retryAfterSeconds: 60 },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } },
    );
  }

  const nowMs = Date.now();
  const sinceLocal = nowMs - lastClaimedAtMs;
  if (sinceLocal < PUBLIC_TICK_COOLDOWN_MS) {
    return NextResponse.json(
      { status: "ok", ran: false, reason: "cooldown", retryAfterSeconds: Math.ceil((PUBLIC_TICK_COOLDOWN_MS - sinceLocal) / 1000) },
      { headers: NO_STORE },
    );
  }

  let claim: Awaited<ReturnType<typeof claimPublicTick>>;
  try {
    claim = await claimPublicTick({ now: new Date(nowMs) });
  } catch {
    return NextResponse.json(
      { status: "degraded", ran: false, reason: "database-unreachable" },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!claim.claimed) {
    return NextResponse.json(
      { status: "ok", ran: false, reason: "cooldown", retryAfterSeconds: Math.ceil(claim.retryAfterMs / 1000) },
      { headers: NO_STORE },
    );
  }

  lastClaimedAtMs = nowMs;
  const caller = detectDispatchTrigger(request.headers);
  after(async () => {
    await runDispatcherNow("public-tick", undefined, { caller }).catch(() => undefined);
  });
  return NextResponse.json(
    { status: "ok", ran: true, message: "Pending work is being processed in the background.", nextEligibleInSeconds: Math.ceil(PUBLIC_TICK_COOLDOWN_MS / 1000) },
    { headers: NO_STORE },
  );
}
