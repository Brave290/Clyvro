import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { dispatchDueSchedules } from "@/lib/services/schedules";
import { runDueCronJobs } from "@/lib/services/cron-jobs";
import { processScanJobsBounded, timeoutOverdueJobs } from "@/lib/jobs";
import { flushNotificationOutbox } from "@/lib/services/notifications";
import { ensureOwnerLifeGrant, reconcileExpiredPlans } from "@/lib/services/entitlements";
import { getDb } from "@/lib/db";

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
      const db = await getDb();
      // Plan housekeeping: lapsed purchases degrade to Freemium; the
      // founder's life grant (Ultra, no expiry) is re-asserted — both
      // idempotent. Then due work: customer cron jobs, scan slices
      // (generous bounded pass so deep scans actually finish), overdue
      // job timeouts, and the notification outbox.
      await ensureOwnerLifeGrant(db).catch(() => undefined);
      await reconcileExpiredPlans(db).catch(() => undefined);
      await runDueCronJobs({ limit: 25 });
      await timeoutOverdueJobs(db).catch(() => undefined);
      await processScanJobsBounded({ maxSlices: 60, maxRuntimeMs: 240_000 });
      await flushNotificationOutbox({ limit: 30 }).catch(() => undefined);
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
