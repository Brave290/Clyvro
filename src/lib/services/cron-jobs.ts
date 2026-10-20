import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { cronJobs, cronJobRuns, organizations } from "@/lib/db/schema";
import {effectivePlanForOrg, } from "@/lib/plans";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";

/**
 * Customer HTTP cron jobs on Clyvro's own scheduler. Jobs are rows in
 * the database; our app executes due jobs whenever it's active
 * (dashboard use, scan polling) and at least once daily via the
 * internal dispatcher. That is best-effort timing — the UI says so.
 * Targets go through the scanner's SSRF boundary (public URLs only,
 * pinned IPs), so a cron job can never reach internal addresses.
 */

export const CRON_INTERVAL_MIN = 30; // minutes
export const CRON_INTERVAL_MAX = 43_200; // 30 days
const CRON_UA = "ClyvroCron/1.0 (+https://clyvro.vercel.app)";
const RUNS_KEPT = 50;

export interface CronJobInput {
  name: string;
  url: string;
  method?: string;
  body?: string | null;
  intervalMinutes: number;
}

async function orgPlan(db: DB, organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  return effectivePlanForOrg(org);
}

export async function createCronJob(organizationId: string, userId: string, input: CronJobInput, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const plan = await orgPlan(db, organizationId);
  const [{ value: existing }] = await db.select({ value: count() }).from(cronJobs).where(eq(cronJobs.organizationId, organizationId));
  if (existing >= plan.maxCronJobs) {
    throw new ScanError("PLAN_LIMIT", `The ${plan.name} plan includes ${plan.maxCronJobs} cron job${plan.maxCronJobs === 1 ? "" : "s"}. Upgrade for more.`);
  }
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new ScanError("VALIDATION", "Give the cron job a name.");
  const method = input.method === "POST" ? "POST" : "GET";
  const body = method === "POST" ? (input.body?.trim() ? input.body.slice(0, 2048) : null) : null;
  const intervalMinutes = Math.min(CRON_INTERVAL_MAX, Math.max(CRON_INTERVAL_MIN, Math.floor(input.intervalMinutes) || 1440));
  const target = await assertPublicUrl(normalizeScanInput(input.url));
  const id = newId();
  const now = new Date();
  await db.insert(cronJobs).values({
    id, organizationId, createdBy: userId, name,
    url: target.url.href, method, body, intervalMinutes, enabled: true,
    nextRunAt: new Date(now.getTime() + intervalMinutes * 60_000),
  });
  return { id };
}

export async function listCronJobs(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const jobs = await db.select().from(cronJobs).where(eq(cronJobs.organizationId, organizationId)).orderBy(desc(cronJobs.createdAt));
  const withRuns = await Promise.all(jobs.map(async (job) => {
    const runs = await db.select().from(cronJobRuns).where(eq(cronJobRuns.cronJobId, job.id)).orderBy(desc(cronJobRuns.createdAt)).limit(5);
    return { job, runs };
  }));
  return withRuns;
}

async function jobInOrgOrThrow(db: DB, organizationId: string, jobId: string) {
  const [job] = await db.select().from(cronJobs).where(and(eq(cronJobs.id, jobId), eq(cronJobs.organizationId, organizationId))).limit(1);
  if (!job) throw new ScanError("NOT_FOUND", "Cron job not found.");
  return job;
}

export async function setCronJobEnabled(organizationId: string, jobId: string, enabled: boolean, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const job = await jobInOrgOrThrow(db, organizationId, jobId);
  const now = new Date();
  await db.update(cronJobs).set({
    enabled,
    // Re-enabling schedules the next run a full interval out (no burst catch-up).
    nextRunAt: enabled ? new Date(now.getTime() + job.intervalMinutes * 60_000) : job.nextRunAt,
  }).where(eq(cronJobs.id, jobId));
}

export async function deleteCronJob(organizationId: string, jobId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await jobInOrgOrThrow(db, organizationId, jobId);
  await db.delete(cronJobs).where(eq(cronJobs.id, jobId));
}

/** Execute one job now; records the run and (optionally) reschedules. Never throws. */
export async function executeCronJob(
  job: typeof cronJobs.$inferSelect,
  opts: { reschedule?: boolean; transport?: Transport } = {},
  dbOverride?: DB,
): Promise<{ ok: boolean; status: number | null }> {
  const db = dbOverride ?? (await getDb());
  const started = Date.now();
  let status: number | null = null;
  let ok = false;
  let error: string | null = null;
  try {
    const outcome = await fetchPublic(new URL(job.url), {
      method: job.method === "POST" ? "POST" : "GET",
      body: job.method === "POST" ? job.body ?? undefined : undefined,
      userAgent: CRON_UA,
      accept: "*/*",
      maxBytes: 32_000,
      allowNonHtmlBody: true,
      timeoutMs: 15_000,
      transport: opts.transport,
    });
    status = outcome.status;
    ok = status >= 200 && status < 400;
    if (!ok) error = `HTTP ${status}`;
  } catch (err) {
    error = err instanceof ScanError ? err.message : "Request failed";
  }
  const now = new Date();
  try {
    await db.insert(cronJobRuns).values({
      id: newId(), cronJobId: job.id, status, ok, durationMs: Date.now() - started, error,
    });
    await db.update(cronJobs).set({
      lastRunAt: now, lastStatus: status, lastError: error,
      ...(opts.reschedule ? { nextRunAt: new Date(now.getTime() + job.intervalMinutes * 60_000) } : {}),
    }).where(eq(cronJobs.id, job.id));
    // Prune old runs (keep the newest RUNS_KEPT).
    const all = await db.select({ id: cronJobRuns.id }).from(cronJobRuns).where(eq(cronJobRuns.cronJobId, job.id)).orderBy(desc(cronJobRuns.createdAt));
    for (const extra of all.slice(RUNS_KEPT)) await db.delete(cronJobRuns).where(eq(cronJobRuns.id, extra.id));
  } catch { /* recording must never crash the scheduler loop */ }
  return { ok, status };
}

export async function runCronJobNow(organizationId: string, jobId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const job = await jobInOrgOrThrow(db, organizationId, jobId);
  return executeCronJob(job, { reschedule: false }, db);
}

/** Execute due jobs (called by the daily dispatcher and opportunistic nudges). */
export async function runDueCronJobs(opts: { limit?: number; transport?: Transport } = {}, dbOverride?: DB): Promise<{ ran: number }> {
  const db = dbOverride ?? (await getDb());
  const now = new Date();
  const due = await db.select().from(cronJobs)
    .where(and(eq(cronJobs.enabled, true), lte(cronJobs.nextRunAt, now)))
    .orderBy(asc(cronJobs.nextRunAt))
    .limit(Math.min(Math.max(opts.limit ?? 10, 1), 50));
  let ran = 0;
  for (const job of due) {
    await executeCronJob(job, { reschedule: true, transport: opts.transport }, db);
    ran++;
  }
  return { ran };
}
