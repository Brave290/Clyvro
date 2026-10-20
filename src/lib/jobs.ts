import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { audits, auditPages, findings, organizations, scanJobs, usageEvents } from "@/lib/db/schema";
import { effectivePlan } from "@/lib/plans";
import { isScanMode, scanLimitsForMode } from "@/lib/scan-modes";
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
      status: failed ? "failed" : "queued",
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
      await db.update(audits).set({ status: "failed", errorCode: "WORKER_TIMEOUT", errorMessage: "The scan couldn't be completed within the worker's execution limits. Please retry.", finishedAt: now }).where(and(eq(audits.id, row.auditId), eq(audits.status, "running")));
    } else {
      await db.update(audits).set({ status: "queued" }).where(and(eq(audits.id, row.auditId), eq(audits.status, "running")));
    }
  }
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

  const [candidate] = await db.select().from(scanJobs)
    .where(eq(scanJobs.status, "queued"))
    .orderBy(asc(scanJobs.createdAt))
    .limit(1);
  if (!candidate) return false;

  const now = new Date();
  const leaseToken = newId();
  await db.update(scanJobs).set({
    status: "running",
    attempts: sql`${scanJobs.attempts} + 1`,
    lockedAt: now,
    leaseExpiresAt: new Date(now.getTime() + WORKER_LEASE_MS),
    leaseToken,
    updatedAt: now,
  }).where(and(eq(scanJobs.id, candidate.id), eq(scanJobs.status, "queued")));
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

  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, audit.organizationId)).limit(1);
    const plan = effectivePlan(org?.planId);
    const limits = scanLimitsForMode(isScanMode(audit.scanMode) ? audit.scanMode : "normal", plan);
    await db.update(audits).set({ status: "running", startedAt: audit.startedAt ?? now }).where(eq(audits.id, audit.id));

    const slice = await runScanSlice(audit.targetUrl, {
      ...scanDeps,
      checkpoint: job.checkpoint ?? undefined,
      workBudget: SCAN_CONFIG.sliceWorkBudget,
      limits,
      auditTypes: audit.auditTypes,
      locale: audit.locale,
    });

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
    await db.transaction(async (tx) => {
      const completed = await tx.update(scanJobs).set({
        status: "done", checkpoint: null, failureCount: 0, lastError: null,
        lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date(),
      }).where(and(eq(scanJobs.id, job.id), eq(scanJobs.status, "running"), eq(scanJobs.leaseToken, leaseToken))).returning();
      if (completed.length === 0) return; // expired/reclaimed worker cannot publish stale report data

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
        coverage: report.coverage, limitations: report.limitations, errorCode: report.error?.code ?? null,
        errorMessage: report.error?.message ?? null, durationMs: report.durationMs,
        startedAt: new Date(report.startedAt), finishedAt: new Date(),
      }).where(eq(audits.id, audit.id));

      // Charge once for successful/partial completion; failed reports are free.
      if (report.status !== "failed") {
        await tx.insert(usageEvents).values({ id: newId(), organizationId: audit.organizationId, auditId: audit.id, kind: "scan" }).onConflictDoNothing({ target: usageEvents.auditId });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown worker error";
    const failureCount = job.failureCount + 1;
    const terminal = failureCount >= MAX_CONSECUTIVE_FAILURES || (err instanceof ScanError && TERMINAL_SCAN_ERRORS.has(err.code));
    const at = new Date();
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
      if (terminal) {
        await tx.update(audits).set({ status: "failed", errorCode: err instanceof ScanError ? err.code : "WORKER_ERROR", errorMessage: "The scan couldn't be completed. Please try again.", finishedAt: at }).where(eq(audits.id, audit.id));
      } else {
        await tx.update(audits).set({ status: "queued" }).where(eq(audits.id, audit.id));
      }
    });
  }
  return true;
}

/** Process no more than this many slices or this elapsed time. */
export async function processScanJobsBounded(options: {
  maxSlices?: number;
  maxRuntimeMs?: number;
  scanDeps?: ScanDeps;
  dbOverride?: DB;
} = {}) {
  const maxSlices = Math.max(1, Math.min(20, options.maxSlices ?? 4));
  const maxRuntimeMs = Math.max(1_000, Math.min(260_000, options.maxRuntimeMs ?? 220_000));
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
