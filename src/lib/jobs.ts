import { and, asc, desc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { audits, auditPages, findings, organizations, scanJobs, users } from "@/lib/db/schema";
import { effectivePlanForOrg } from "@/lib/plans";
import { isScanMode, scanLimitsForMode, workBudgetForMode } from "@/lib/scan-modes";
import { settleScanUsage } from "@/lib/services/entitlements";
import { enqueueUserNotification } from "@/lib/services/notifications";
import { SCAN_CONFIG } from "@/lib/scanner/config";
import { runScanSlice, type ScanDeps } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";
import { findingKey } from "@/lib/services/audits";

/**
 * Database-backed resumable work. Each invocation performs one finite scan
 * slice, stores metadata-only checkpoint state, and returns the job to the
 * queue. Production drains a small bounded number of slices from `after()`
 * and a single daily Vercel Cron dispatcher; local development retains the
 * in-process polling worker for convenience.
 */

const MAX_CONSECUTIVE_FAILURES = 3;
const WORKER_LEASE_MS = 4 * 60 * 1000;
const HEARTBEAT_MS = 30_000;

/** Structured worker log: job/audit ids, stage, elapsed, retries. Never targets, tokens, or content. */
function jobLog(event: string, fields: Record<string, unknown>) {
  console.info("[scan-job]", JSON.stringify({ event, ...fields }));
}
const TERMINAL_SCAN_ERRORS = new Set([
  "CHECKPOINT_INVALID", "INVALID_URL", "BLOCKED_PROTOCOL", "BLOCKED_CREDENTIALS",
  "BLOCKED_PORT", "BLOCKED_HOST", "BLOCKED_IP",
]);

async function recoverExpiredLeases(db: DB) {
  const now = new Date();
  const expired = and(eq(scanJobs.status, "running"), or(isNull(scanJobs.leaseExpiresAt), lte(scanJobs.leaseExpiresAt, now)));
  const stale = await db.select({ id: scanJobs.id, auditId: scanJobs.auditId, failureCount: scanJobs.failureCount })
    .from(scanJobs).where(expired).orderBy(asc(scanJobs.updatedAt)).limit(50);
  for (const row of stale) {
    const failed = row.failureCount + 1 >= MAX_CONSECUTIVE_FAILURES;
    const recovered = await db.update(scanJobs).set({
      status: failed ? "timed_out" : "queued",
      failureCount: row.failureCount + 1,
      checkpoint: failed ? null : undefined,
      lockedAt: null,
      leaseExpiresAt: null,
      leaseToken: null,
      lastError: failed ? "The scan worker repeatedly exceeded its execution lease." : "Recovered an expired worker lease.",
      updatedAt: now,
    }).where(and(eq(scanJobs.id, row.id), eq(scanJobs.status, "running"), or(isNull(scanJobs.leaseExpiresAt), lte(scanJobs.leaseExpiresAt, now)))).returning();
    if (recovered.length === 0) continue;
    if (failed) {
      await db.update(audits).set({ status: "timed_out", errorCode: "WORKER_TIMEOUT", errorMessage: "The scan worker stopped responding repeatedly, so this run was timed out. No quota was charged — please retry.", finishedAt: now }).where(and(eq(audits.id, row.auditId), eq(audits.status, "running")));
      jobLog("lease_expired_terminal", { auditId: row.auditId, jobId: row.id, retries: row.failureCount + 1 });
    } else {
      await db.update(audits).set({ status: "queued" }).where(and(eq(audits.id, row.auditId), eq(audits.status, "running")));
    }
  }
}

/**
 * Absolute job deadline: any audit still queued/running past
 * SCAN_JOB_MAX_DURATION_MS becomes `timed_out` (free — never charged),
 * with the durable checkpoint coverage preserved on the audit row so the
 * UI can say exactly how far it got. This is the guarantee that no scan
 * can sit in "running" forever.
 */
export async function timeoutOverdueJobs(db: DB): Promise<number> {
  const cutoff = new Date(Date.now() - SCAN_CONFIG.jobMaxDurationMs);
  const overdue = await db.select({ audit: audits, job: scanJobs })
    .from(audits)
    .innerJoin(scanJobs, eq(scanJobs.auditId, audits.id))
    .where(and(inArray(audits.status, ["queued", "running"]), lt(audits.createdAt, cutoff)))
    .limit(50);
  let count = 0;
  for (const { audit, job } of overdue) {
    const updated = await db.update(scanJobs).set({
      status: "timed_out", checkpoint: null, lockedAt: null, leaseExpiresAt: null, leaseToken: null,
      lastError: "Exceeded the maximum scan duration.", updatedAt: new Date(),
    }).where(and(eq(scanJobs.id, job.id), inArray(scanJobs.status, ["queued", "running"]))).returning();
    if (updated.length === 0) continue;
    const coverage = job.checkpoint?.crawl?.coverage;
    await db.update(audits).set({
      status: "timed_out",
      errorCode: "SCAN_TIMEOUT",
      errorMessage: "This scan reached its maximum run time and was stopped. No quota was charged — retry, or narrow the scan (Normal/Strict) for a faster result.",
      ...(coverage ? { coverage } : {}),
      finishedAt: new Date(),
    }).where(eq(audits.id, audit.id));
    jobLog("job_timed_out", { auditId: audit.id, jobId: job.id, retries: job.failureCount, pagesFetched: coverage?.pagesFetched ?? 0 });
    count++;
  }
  return count;
}

export interface ScanProgress {
  jobStatus: string | null;
  stage: "queued" | "crawling" | "verifying" | "done";
  pagesFetched: number;
  pagesParsed: number;
  linksChecked: number;
  linksDiscovered: number;
  queuedPages: number;
  attempts: number;
  failureCount: number;
  startedAt: string | null;
  updatedAt: string | null;
}

/** Real progress from the persisted checkpoint — completed work only, never an invented percentage. */
export async function getScanProgress(organizationId: string, auditId: string, dbOverride?: DB): Promise<ScanProgress | null> {
  const db = dbOverride ?? (await getDb());
  const [audit] = await db.select({ id: audits.id, coverage: audits.coverage }).from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.organizationId, organizationId))).limit(1);
  if (!audit) return null;
  const [job] = await db.select().from(scanJobs).where(eq(scanJobs.auditId, auditId)).limit(1);
  if (!job) return null;
  const crawl = job.checkpoint?.crawl;
  // Terminal jobs have no checkpoint; fall back to the audit's final coverage.
  const coverage = crawl?.coverage ?? (audit.coverage as typeof crawl extends { coverage: infer C } ? C : never) ?? undefined;
  return {
    jobStatus: job.status,
    stage: job.status === "done" || job.status === "failed" || job.status === "timed_out" || job.status === "cancelled"
      ? "done"
      : !crawl ? "queued" : crawl.phase === "verify" ? "verifying" : "crawling",
    pagesFetched: coverage?.pagesFetched ?? 0,
    pagesParsed: coverage?.pagesParsed ?? 0,
    linksChecked: coverage?.linksChecked ?? 0,
    linksDiscovered: coverage?.linksDiscovered ?? 0,
    queuedPages: crawl?.queue?.length ?? 0,
    attempts: job.attempts,
    failureCount: job.failureCount,
    startedAt: job.lockedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt?.toISOString() ?? null,
  };
}

export async function enqueueScanJob(auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await db.insert(scanJobs).values({ id: newId(), auditId, status: "queued" }).onConflictDoNothing({ target: scanJobs.auditId });
  kickWorker();
}

/** Claim and process exactly one bounded scan slice. Returns false when idle. */
export async function processNextScanJob(scanDeps: ScanDeps = {}, dbOverride?: DB): Promise<boolean> {
  const db = dbOverride ?? (await getDb());
  await recoverExpiredLeases(db);
  await timeoutOverdueJobs(db);

  const [candidate] = await db.select().from(scanJobs)
    .where(eq(scanJobs.status, "queued"))
    .orderBy(asc(scanJobs.createdAt))
    .limit(1);
  if (!candidate) return false;

  const now = new Date();
  const leaseToken = newId();
  const claimed = await db.update(scanJobs).set({
    status: "running",
    attempts: sql`${scanJobs.attempts} + 1`,
    lockedAt: now,
    leaseExpiresAt: new Date(now.getTime() + WORKER_LEASE_MS),
    leaseToken,
    updatedAt: now,
  }).where(and(eq(scanJobs.id, candidate.id), eq(scanJobs.status, "queued"))).returning();
  if (claimed.length === 0) return true; // another worker claimed it first
  const [job] = await db.select().from(scanJobs)
    .where(and(eq(scanJobs.id, candidate.id), eq(scanJobs.status, "running"), eq(scanJobs.leaseToken, leaseToken)))
    .limit(1);
  if (!job) return true; // another invocation claimed the candidate

  const [audit] = await db.select().from(audits).where(eq(audits.id, job.auditId)).limit(1);
  if (!audit) {
    await db.update(scanJobs).set({ status: "failed", checkpoint: null, lastError: "Audit row missing", lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date() })
      .where(and(eq(scanJobs.id, job.id), eq(scanJobs.leaseToken, leaseToken)));
    return true;
  }

  const sliceStartedAt = Date.now();
  // Heartbeat: extend the lease while a slice runs so a live worker is
  // never mistaken for a dead one (and a dead one is recovered fast).
  const heartbeat = setInterval(() => {
    void db.update(scanJobs).set({
      leaseExpiresAt: new Date(Date.now() + WORKER_LEASE_MS), updatedAt: new Date(),
    }).where(and(eq(scanJobs.id, job.id), eq(scanJobs.status, "running"), eq(scanJobs.leaseToken, leaseToken)))
      .then(() => undefined, () => undefined);
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, audit.organizationId)).limit(1);
    const plan = effectivePlanForOrg(org ?? { planId: "freemium", planExpiresAt: null });
    const mode = isScanMode(audit.scanMode) ? audit.scanMode : "normal";
    const limits = scanLimitsForMode(mode, plan);
    await db.update(audits).set({ status: "running", startedAt: audit.startedAt ?? now }).where(eq(audits.id, audit.id));
    jobLog("slice_start", { auditId: audit.id, jobId: job.id, stage: mode, retries: job.failureCount });

    const slice = await runScanSlice(audit.targetUrl, {
      ...scanDeps,
      checkpoint: job.checkpoint ?? undefined,
      workBudget: workBudgetForMode(mode),
      limits,
      auditTypes: audit.auditTypes,
      locale: audit.locale,
      sitemap: audit.scanMode === "deep",
      // Phase 2: injection-detection probes only on deep scans — which
      // are ownership-verified before they ever reach this worker.
      vulnProbes: audit.scanMode === "deep",
      ownerDeep: audit.scanMode === "deep",
    });
    jobLog("slice_end", { auditId: audit.id, jobId: job.id, stage: mode, elapsedMs: Date.now() - sliceStartedAt, done: slice.done });

    if (!slice.done) {
      if (!slice.checkpoint) throw new ScanError("CHECKPOINT_INVALID", "Scanner did not return a resumable checkpoint.");
      const checkpoint = slice.checkpoint;
      const at = new Date();
      await db.transaction(async (tx) => {
        const updated = await tx.update(scanJobs).set({
          status: "queued", checkpoint, failureCount: 0, lastError: null,
          lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: at,
        }).where(and(eq(scanJobs.id, job.id), eq(scanJobs.status, "running"), eq(scanJobs.leaseToken, leaseToken))).returning();
        if (updated.length === 0) return; // stale worker must not overwrite a newer lease
        await tx.update(audits).set({ status: "running", startedAt: audit.startedAt ?? new Date(checkpoint.startedAt), errorCode: null, errorMessage: null, finishedAt: null }).where(eq(audits.id, audit.id));
      });
      return true;
    }

    const report = slice.report;
    if (!report) throw new ScanError("CHECKPOINT_INVALID", "Scanner completed without a report.");
    let published = false;
    await db.transaction(async (tx) => {
      const completed = await tx.update(scanJobs).set({
        status: "done", checkpoint: null, failureCount: 0, lastError: null,
        lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date(),
      }).where(and(eq(scanJobs.id, job.id), eq(scanJobs.status, "running"), eq(scanJobs.leaseToken, leaseToken))).returning();
      if (completed.length === 0) return; // expired/reclaimed/cancelled worker cannot publish stale data
      published = true;

      await tx.delete(auditPages).where(eq(auditPages.auditId, audit.id));
      await tx.delete(findings).where(eq(findings.auditId, audit.id));
      if (report.pages.length) {
        await tx.insert(auditPages).values(report.pages.map((p) => ({
          id: newId(), auditId: audit.id, url: p.url, status: p.status, bytes: p.bytes, durationMs: p.durationMs, title: p.title,
        })));
      }
      if (report.findings.length) {
        await tx.insert(findings).values(report.findings.map((f) => ({
          id: newId(), auditId: audit.id, findingKey: findingKey(f), ruleId: f.ruleId, ruleVersion: f.ruleVersion,
          category: f.category, severity: f.severity, confidenceBasis: f.confidenceBasis, page: f.page,
          title: f.title, explanation: f.explanation, evidence: f.evidence, recommendation: f.recommendation,
          effort: f.effort, impactRationale: f.impactRationale,
        })));
      }
      await tx.update(audits).set({
        status: report.status, finalUrl: report.finalUrl, rulesetVersion: report.rulesetVersion, score: report.score,
        technology: report.tech ?? [],
        coverage: report.coverage, limitations: report.limitations, errorCode: report.error?.code ?? null,
        errorMessage: report.error?.message ?? null, durationMs: report.durationMs,
        startedAt: new Date(report.startedAt), finishedAt: new Date(),
      }).where(eq(audits.id, audit.id));

      // Central settlement: exactly one charge for completed/partial,
      // free for failed/timed-out/cancelled (see entitlements.ts).
      await settleScanUsage(tx, audit, report.status === "failed" ? "failed" : report.status);
    });
    if (published) await notifyScanFinished(db, audit, report.status, job.failureCount).catch(() => undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown worker error";
    const failureCount = job.failureCount + 1;
    const terminal = failureCount >= MAX_CONSECUTIVE_FAILURES || (err instanceof ScanError && TERMINAL_SCAN_ERRORS.has(err.code));
    const at = new Date();
    let failureApplied = false;
    await db.transaction(async (tx) => {
      const failed = await tx.update(scanJobs).set({
        status: terminal ? "failed" : "queued",
        failureCount,
        lastError: message.slice(0, 500),
        lockedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
        ...(terminal ? { checkpoint: null } : {}),
        updatedAt: at,
      }).where(and(eq(scanJobs.id, job.id), eq(scanJobs.status, "running"), eq(scanJobs.leaseToken, leaseToken))).returning();
      if (failed.length === 0) return; // another worker owns the current lease
      failureApplied = true;
      if (terminal) {
        await tx.update(audits).set({ status: "failed", errorCode: err instanceof ScanError ? err.code : "WORKER_ERROR", errorMessage: "The scan couldn't be completed. Please try again.", finishedAt: at }).where(eq(audits.id, audit.id));
      } else {
        await tx.update(audits).set({ status: "queued" }).where(eq(audits.id, audit.id));
      }
    });
    jobLog("slice_failed", { auditId: audit.id, jobId: job.id, elapsedMs: Date.now() - sliceStartedAt, retries: failureCount, terminal, code: err instanceof ScanError ? err.code : "WORKER_ERROR" });
    if (terminal && failureApplied) {
      await notifyScanFinished(db, audit, "failed", failureCount).catch(() => undefined);
    }
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

/**
 * Scan-finished notifications (deduped per audit+outcome in the outbox).
 * Also flags genuinely new high/critical findings vs the previous scan of
 * the same site. Notification problems never fail the scan itself.
 */
async function notifyScanFinished(
  db: DB,
  audit: typeof audits.$inferSelect,
  status: "completed" | "partial" | "failed",
  failureCount: number,
): Promise<void> {
  const [requester] = await db.select({ email: users.email }).from(users).where(eq(users.id, audit.requestedBy)).limit(1);
  if (!requester) return;
  const kind = status === "completed" ? "scan_completed" : status === "partial" ? "scan_partial" : "scan_failed";
  await enqueueUserNotification({
    organizationId: audit.organizationId, userId: audit.requestedBy, category: "scanResults",
    kind, dedupeKey: `${kind}:${audit.id}`, toEmail: requester.email,
    subject: status === "failed" ? "A scan couldn't be completed" : `Scan ${status}: ${audit.targetUrl}`,
    body: status === "failed"
      ? `The scan of ${audit.targetUrl} couldn't be completed after ${failureCount} attempt(s). No quota was charged. You can retry it from the audit page.`
      : `Your ${audit.scanMode} scan of ${audit.targetUrl} finished with status "${status}". Open Clyvro to see the evidence-backed report.`,
  }, db);

  // Quota warning at 80%/100% of the monthly allowance (once per month
  // per threshold, deduped in the outbox).
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, audit.organizationId)).limit(1);
    if (org) {
      const plan = effectivePlanForOrg(org);
      const { monthlyScanUsage } = await import("@/lib/services/audits");
      const used = await monthlyScanUsage(audit.organizationId, db);
      const month = new Date().toISOString().slice(0, 7);
      for (const threshold of [100, 80]) {
        if (used >= Math.ceil((plan.scansPerMonth * threshold) / 100)) {
          await enqueueUserNotification({
            organizationId: audit.organizationId, userId: audit.requestedBy, category: "quota",
            kind: "quota_warning", dedupeKey: `quota:${audit.organizationId}:${month}:${threshold}`,
            toEmail: requester.email,
            subject: threshold === 100 ? "Monthly scan quota reached" : "You're at 80% of your monthly scans",
            body: `Your workspace has used ${used} of ${plan.scansPerMonth} scans on the ${plan.name} plan this month. Quotas reset on the 1st; failed, timed-out and cancelled scans never count.`,
          }, db);
          break;
        }
      }
    }
  } catch { /* quota warnings are best-effort */ }

  if (status === "failed") return;
  // Regression signal: high/critical finding keys that weren't in the
  // previous finished scan of the same project (or same URL for quick scans).
  const [previous] = await db.select({ id: audits.id }).from(audits)
    .where(and(
      eq(audits.organizationId, audit.organizationId),
      ne(audits.id, audit.id),
      audit.projectId ? eq(audits.projectId, audit.projectId) : eq(audits.targetUrl, audit.targetUrl),
      inArray(audits.status, ["completed", "partial"]),
    ))
    .orderBy(desc(audits.createdAt)).limit(1);
  if (!previous || previous.id === audit.id) return;
  const [currentKeys, previousKeys] = await Promise.all([
    db.select({ findingKey: findings.findingKey }).from(findings)
      .where(and(eq(findings.auditId, audit.id), inArray(findings.severity, ["critical", "high"]))),
    db.select({ findingKey: findings.findingKey }).from(findings)
      .where(eq(findings.auditId, previous.id)),
  ]);
  const before = new Set(previousKeys.map((f) => f.findingKey));
  const fresh = currentKeys.filter((f) => !before.has(f.findingKey));
  if (fresh.length > 0) {
    await enqueueUserNotification({
      organizationId: audit.organizationId, userId: audit.requestedBy, category: "scanResults",
      kind: "critical_finding", dedupeKey: `critical-finding:${audit.id}`, toEmail: requester.email,
      subject: `${fresh.length} new high-priority finding(s): ${audit.targetUrl}`,
      body: `The latest scan of ${audit.targetUrl} surfaced ${fresh.length} high/critical finding(s) that weren't in the previous scan. Open the report to review the evidence.`,
    }, db);
  }
}

/** Process no more than this many slices or this elapsed time. */
export async function processScanJobsBounded(options: {
  maxSlices?: number;
  maxRuntimeMs?: number;
  scanDeps?: ScanDeps;
  dbOverride?: DB;
} = {}) {
  const maxSlices = Math.max(1, Math.min(120, options.maxSlices ?? 4));
  const maxRuntimeMs = Math.max(1_000, Math.min(280_000, options.maxRuntimeMs ?? 220_000));
  const started = Date.now();
  let processedSlices = 0;
  while (processedSlices < maxSlices && Date.now() - started < maxRuntimeMs) {
    const processed = await processNextScanJob(options.scanDeps, options.dbOverride);
    if (!processed) break;
    processedSlices++;
  }
  return { processedSlices, elapsedMs: Date.now() - started };
}

let workerStarted = false;
let workerBusy = false;

async function drainQueue() {
  if (workerBusy || process.env.NODE_ENV === "production") return;
  workerBusy = true;
  try {
    while (await processNextScanJob()) { /* local development convenience only */ }
  } catch { /* the next tick retries; durable status remains in the DB */ }
  finally { workerBusy = false; }
}

export function kickWorker() {
  if (process.env.NODE_ENV !== "production") void drainQueue();
}

/** Starts the polling worker only in local development. */
export function ensureScanWorker() {
  if (workerStarted || process.env.NODE_ENV === "production") return;
  workerStarted = true;
  void drainQueue();
  const timer = setInterval(() => void drainQueue(), 3000);
  timer.unref?.();
}
