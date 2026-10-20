import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { dispatchDueSchedules } from "@/lib/services/schedules";
import { runDueCronJobs } from "@/lib/services/cron-jobs";
import { processScanJobsBounded } from "@/lib/jobs";

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

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Dispatcher secret is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const dispatched = await dispatchDueSchedules({ maxSchedules: 3 });
    // 12 slices: enough to finish abandoned deep scans, still hard-bounded
    // by maxRuntimeMs within the 300s function limit. Customer cron jobs
    // (our own scheduler) get their guaranteed daily pass here too.
    after(async () => {
      await runDueCronJobs({ limit: 25 });
      await processScanJobsBounded({ maxSlices: 12, maxRuntimeMs: 220_000 });
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
