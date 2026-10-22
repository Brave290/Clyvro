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
/** Branded cron User-Agent — always exposes Clyvro Dev identity clearly. */
function cronUserAgent(): string {
  const domain = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "");
  return `Clyvro-Dev-Cron/1.0 (+${domain})`;
}
const CRON_UA = cronUserAgent();

/** Timeout for each cron execution (ms). */
export const CRON_REQUEST_TIMEOUT_MS = 15_000;
/** Max retries with exponential backoff for transient failures (5xx, network). */
export const CRON_MAX_RETRIES = 2;
/** Whether a status/error is considered retryable (transient). */
export function isRetryableCronError(status: number | null, error: string | null): boolean {
  if (status !== null) return status >= 500 || status === 429;
  if (!error) return true;
  return /timeout|fetch_failed|network|connection|econnreset|etimedout/i.test(error);
}

/** HMAC-based deduplication key for cron executions (prevents duplicate within window). */
export function cronDedupKey(jobId: string, windowMs = 60_000): string {
  const windowBucket = Math.floor(Date.now() / windowMs);
  return `cron:exec:${jobId}:${windowBucket}`;
}
const RUNS_KEPT = 50;
/** Response body kept per run (the UI shows it verbatim; larger bodies are marked truncated). */
export const CRON_BODY_KEPT = 8_192;
const CRON_FETCH_BYTES = 64_000;

/** Standard reason phrases so the UI can print "HTTP 503 Service Unavailable" like a real client would. */
export const HTTP_REASONS: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 303: "See Other",
  304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized",
  402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
  409: "Conflict", 410: "Gone", 413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity",
  429: "Too Many Requests", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
};
export function statusLine(status: number | null): string {
  if (status === null) return 'No HTTP response';
  const reason = HTTP_REASONS[status];
  return reason ? `HTTP ${status} ${reason}` : `HTTP ${status}`;
}

export type CronTrigger = "schedule" | "manual";

export interface CronRunResult {
  ok: boolean;
  status: number | null;
  statusLine: string;
  durationMs: number;
  error: string | null;
  trigger: CronTrigger;
  finalUrl: string | null;
  response: {
    headers: Record<string, string>;
    body: string | null;
    contentType: string | null;
    bytes: number | null;
    truncated: boolean;
  };
}

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

/**
 * Execute one job now; records the run — status, every response header
 * (cookie values redacted), the first 8 KB of the body, timing — and
 * (optionally) reschedules. Never throws.
 */
export async function executeCronJob(
  job: typeof cronJobs.$inferSelect,
  opts: { reschedule?: boolean; transport?: Transport; trigger?: CronTrigger } = {},
  dbOverride?: DB,
): Promise<CronRunResult> {
  const db = dbOverride ?? (await getDb());
  const started = Date.now();
  const trigger: CronTrigger = opts.trigger ?? (opts.reschedule ? "schedule" : "manual");
  let status: number | null = null;
  let ok = false;
  let error: string | null = null;
  let finalUrl: string | null = null;
  const response: CronRunResult["response"] = { headers: {}, body: null, contentType: null, bytes: null, truncated: false };
  // Retry with exponential backoff for transient failures (5xx, 429, timeout)
  let lastOutcome: Awaited<ReturnType<typeof fetchPublic>> | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= CRON_MAX_RETRIES; attempt++) {
    try {
      const outcome = await fetchPublic(new URL(job.url), {
        method: job.method === "POST" ? "POST" : "GET",
        body: job.method === "POST" ? job.body ?? undefined : undefined,
        userAgent: CRON_UA,
        accept: "*/*",
        maxBytes: CRON_FETCH_BYTES,
        allowNonHtmlBody: true,
        captureAllHeaders: true,
        timeoutMs: CRON_REQUEST_TIMEOUT_MS,
        transport: opts.transport,
      });
      lastOutcome = outcome;
      if ((outcome.status >= 500 || outcome.status === 429) && attempt < CRON_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      break;
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ScanError
        ? /TIMEOUT|FETCH_FAILED|DEADLINE/i.test(err.code)
        : true;
      if (retryable && attempt < CRON_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      break;
    }
  }
  if (lastOutcome) {
    status = lastOutcome.status;
    ok = status >= 200 && status < 400;
    if (!ok) error = statusLine(status);
    finalUrl = lastOutcome.finalUrl;
    response.headers = lastOutcome.allHeaders ?? lastOutcome.headers ?? {};
    response.contentType = lastOutcome.contentType;
    response.bytes = lastOutcome.bytes;
    const b = lastOutcome.bodyText ?? "";
    response.truncated = lastOutcome.truncated || b.length > CRON_BODY_KEPT;
    response.body = b ? b.slice(0, CRON_BODY_KEPT) : null;
  } else if (lastErr) {
    error = lastErr instanceof ScanError ? lastErr.message : "Request failed";
  }
  const durationMs = Date.now() - started;
  const now = new Date();
  try {
    await db.insert(cronJobRuns).values({
      id: newId(), cronJobId: job.id, status, ok, durationMs, error, trigger,
      responseHeaders: response.headers, responseBody: response.body, responseContentType: response.contentType,
      responseBytes: response.bytes, responseTruncated: response.truncated, finalUrl,
    });
    await db.update(cronJobs).set({
      lastRunAt: now, lastStatus: status, lastError: error, lastDurationMs: durationMs,
      consecutiveFailures: ok ? 0 : (job.consecutiveFailures ?? 0) + 1,
      ...(opts.reschedule ? { nextRunAt: new Date(now.getTime() + job.intervalMinutes * 60_000) } : {}),
    }).where(eq(cronJobs.id, job.id));
    // Prune old runs (keep the newest RUNS_KEPT).
    const all = await db.select({ id: cronJobRuns.id }).from(cronJobRuns).where(eq(cronJobRuns.cronJobId, job.id)).orderBy(desc(cronJobRuns.createdAt));
    for (const extra of all.slice(RUNS_KEPT)) await db.delete(cronJobRuns).where(eq(cronJobRuns.id, extra.id));
  } catch { /* recording must never crash the scheduler loop */ }
  return { ok, status, statusLine: statusLine(status), durationMs, error, trigger, finalUrl, response };
}

export async function runCronJobNow(organizationId: string, jobId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const job = await jobInOrgOrThrow(db, organizationId, jobId);
  return executeCronJob(job, { reschedule: false, trigger: "manual" }, db);
}

/** Full run history for one job (newest first), including captured responses. */
export async function listCronJobRuns(organizationId: string, jobId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await jobInOrgOrThrow(db, organizationId, jobId);
  return db.select().from(cronJobRuns).where(eq(cronJobRuns.cronJobId, jobId)).orderBy(desc(cronJobRuns.createdAt)).limit(RUNS_KEPT);
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
    await executeCronJob(job, { reschedule: true, transport: opts.transport, trigger: "schedule" }, db);
    ran++;
  }
  return { ran };
}
