import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { detectDispatchTrigger, runDispatcherNow } from "@/lib/services/dispatch";
import { dispatchDueSchedules } from "@/lib/services/schedules";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const provided = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "") : "";
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Main website dispatcher endpoint. Triggered by Vercel Cron (daily,
 * vercel.json), cron-job.org or any external scheduler with the
 * CRON_SECRET bearer token; every run is recorded (Admin → Cron).
 * The quick response acknowledges due schedules; the bounded background
 * pass (scan slices, customer cron jobs, outbox, housekeeping) runs in
 * `after()` and lands in the same dispatch_runs row when it finishes.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Dispatcher secret is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const trigger = detectDispatchTrigger(request.headers);
  try {
    const dispatched = await dispatchDueSchedules({ maxSchedules: 3 });
    after(async () => {
      await runDispatcherNow(trigger).catch(() => undefined);
    });
    return NextResponse.json({
      schedulesEnqueued: dispatched.enqueued,
      schedulesPaused: dispatched.paused,
      message: "Due schedules have been queued; bounded scan work continues in the background.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Scheduled dispatch failed; eligible work remains stored for a later retry." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
