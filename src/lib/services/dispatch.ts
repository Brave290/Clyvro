import { desc } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { dispatchRuns } from "@/lib/db/schema";
import { dispatchDueSchedules } from "@/lib/services/schedules";
import { runDueCronJobs } from "@/lib/services/cron-jobs";
import { processScanJobsBounded, timeoutOverdueJobs } from "@/lib/jobs";
import { flushNotificationOutbox } from "@/lib/services/notifications";
import { ensureOwnerLifeGrant, reconcileExpiredPlans } from "@/lib/services/entitlements";

/**
 * The MAIN website dispatcher (scan jobs, due schedules, customer cron
 * jobs, plan housekeeping, notification outbox). Runs from:
 *  - Vercel Cron — registered in vercel.json (`0 3 * * *` → /api/cron/dispatch)
 *  - cron-job.org (or any external scheduler) hitting /api/cron/dispatch
 *    with `Authorization: Bearer $CRON_SECRET`
 *  - an admin pressing "Run dispatcher now" in Admin → Cron
 *  - signed-in dashboard activity (opportunistic, throttled upstream)
 * Every execution records a dispatch_runs row so Admin → Cron shows real
 * history. Customer cron jobs users create in-app are separate
 * (cron_jobs / cron_job_runs, under Admin → Cron → "Customer cron jobs").
 */

export type DispatchTrigger = "vercel-cron" | "cron-job.org" | "manual-admin" | "activity" | "external";

export function detectDispatchTrigger(headers: Headers): DispatchTrigger {
  const ua = (headers.get("user-agent") ?? "").toLowerCase();
  if (headers.get("x-vercel-cron") || ua.includes("vercel-cron")) return "vercel-cron";
  if (ua.includes("cron-job") || ua.includes("cronjob")) return "cron-job.org";
  return "external";
}

export interface DispatchSummary {
  schedulesEnqueued: number;
  schedulesPaused: number;
  message: string;
}

/** Run one full dispatcher pass and record it. Never throws for partial failures of background stages. */
export async function runDispatcherNow(trigger: DispatchTrigger, dbOverride?: DB): Promise<{ runId: string; summary: DispatchSummary }> {
  const db = dbOverride ?? (await getDb());
  const started = Date.now();
  const runId = newId();
  try {
    const dispatched = await dispatchDueSchedules({ maxSchedules: 3 });
    await ensureOwnerLifeGrant(db).catch(() => undefined);
    await reconcileExpiredPlans(db).catch(() => undefined);
    await runDueCronJobs({ limit: 25 }).catch(() => undefined);
    await timeoutOverdueJobs(db).catch(() => undefined);
    const scan = await processScanJobsBounded({ maxSlices: 60, maxRuntimeMs: 240_000 }).catch(() => null);
    await flushNotificationOutbox({ limit: 30 }).catch(() => undefined);
    const summary: DispatchSummary = {
      schedulesEnqueued: dispatched.enqueued,
      schedulesPaused: dispatched.paused,
      message: "Dispatcher pass completed.",
    };
    await db.insert(dispatchRuns).values({
      id: runId, trigger, status: "completed",
      summary: { ...summary, scanWork: scan ?? undefined },
      durationMs: Date.now() - started,
    }).catch(() => undefined);
    return { runId, summary };
  } catch (err) {
    await db.insert(dispatchRuns).values({
      id: runId, trigger, status: "failed",
      error: err instanceof Error ? err.message.slice(0, 300) : "Dispatcher failed",
      durationMs: Date.now() - started,
    }).catch(() => undefined);
    throw err;
  }
}

export async function listDispatchRuns(limit = 50, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(dispatchRuns).orderBy(desc(dispatchRuns.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Recent customer (in-app) cron job runs for the Admin → Cron section. */
export async function listCustomerCronRuns(limit = 30, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const { cronJobRuns, cronJobs } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select({ run: cronJobRuns, job: cronJobs })
    .from(cronJobRuns)
    .innerJoin(cronJobs, eq(cronJobs.id, cronJobRuns.cronJobId))
    .orderBy(desc(cronJobRuns.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map(({ run, job }) => ({
    id: run.id, jobName: job.name, url: job.url, method: job.method,
    ok: run.ok, statusCode: run.status ?? null,
    error: run.error ?? null, at: run.createdAt.toISOString(),
  }));
}
