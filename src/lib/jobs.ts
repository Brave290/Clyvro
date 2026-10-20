import { and, asc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { audits, auditPages, findings, organizations, scanJobs, usageEvents } from "@/lib/db/schema";
import { effectivePlan } from "@/lib/plans";
import { runScan, type ScanDeps } from "@/lib/scanner/scan";
import { findingKey } from "@/lib/services/audits";

/**
 * Durable scan-job processing backed by the database.
 *
 * Why DB-backed: it gives queued/running/completed/failed states, bounded
 * retries and idempotency with zero external credentials, and the queue
 * survives restarts (jobs are rows, not memory). The interface is small
 * (`enqueueScanJob` / the worker loop) so a hosted queue such as
 * Trigger.dev can replace the transport later without touching callers.
 *
 * Idempotency: one job row per audit (unique index), results are written
 * in a single transaction after deleting any partial rows, and the usage
 * charge is a unique-per-audit insert — retries can never double-charge.
 */

const MAX_ATTEMPTS = 2;

export async function enqueueScanJob(auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await db
    .insert(scanJobs)
    .values({ id: newId(), auditId, status: "queued" })
    .onConflictDoNothing({ target: scanJobs.auditId });
  void kickWorker();
}

/** Processes one queued job. Returns false when the queue is empty. Exported for tests. */
export async function processNextScanJob(scanDeps: ScanDeps = {}, dbOverride?: DB): Promise<boolean> {
  const db = dbOverride ?? (await getDb());

  const [job] = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.status, "queued"))
    .orderBy(asc(scanJobs.createdAt))
    .limit(1);
  if (!job) return false;

  // Claim it (single-process worker; the status guard keeps this safe).
  const lockTime = new Date();
  await db
    .update(scanJobs)
    .set({ status: "running", attempts: job.attempts + 1, lockedAt: lockTime, updatedAt: lockTime })
    .where(and(eq(scanJobs.id, job.id), eq(scanJobs.status, "queued")));
  const [claimedRow] = await db.select().from(scanJobs).where(eq(scanJobs.id, job.id)).limit(1);
  if (!claimedRow || claimedRow.lockedAt?.getTime() !== lockTime.getTime()) return true; // someone else took it

  const [audit] = await db.select().from(audits).where(eq(audits.id, job.auditId)).limit(1);
  if (!audit) {
    await db.update(scanJobs).set({ status: "failed", lastError: "Audit row missing", updatedAt: new Date() }).where(eq(scanJobs.id, job.id));
    return true;
  }

  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, audit.organizationId)).limit(1);
    const plan = effectivePlan(org?.planId);
    await db.update(audits).set({ status: "running", startedAt: new Date() }).where(eq(audits.id, audit.id));

    const report = await runScan(audit.targetUrl, {
      ...scanDeps,
      limits: { maxPages: plan.maxPagesPerScan },
      auditTypes: audit.auditTypes,
    });

    await db.transaction(async (tx) => {
      // Idempotent result write: clear any partial rows from a previous attempt.
      await tx.delete(auditPages).where(eq(auditPages.auditId, audit.id));
      await tx.delete(findings).where(eq(findings.auditId, audit.id));

      if (report.pages.length) {
        await tx.insert(auditPages).values(
          report.pages.map((p) => ({
            id: newId(), auditId: audit.id, url: p.url, status: p.status,
            bytes: p.bytes, durationMs: p.durationMs, title: p.title,
          })),
        );
      }
      if (report.findings.length) {
        await tx.insert(findings).values(
          report.findings.map((f) => ({
            id: newId(), auditId: audit.id, findingKey: findingKey(f),
            ruleId: f.ruleId, ruleVersion: f.ruleVersion, category: f.category,
            severity: f.severity, confidenceBasis: f.confidenceBasis, page: f.page,
            title: f.title, explanation: f.explanation, evidence: f.evidence,
            recommendation: f.recommendation, effort: f.effort, impactRationale: f.impactRationale,
          })),
        );
      }
      await tx.update(audits).set({
        status: report.status,
        finalUrl: report.finalUrl,
        rulesetVersion: report.rulesetVersion,
        score: report.score,
        coverage: report.coverage,
        limitations: report.limitations,
        errorCode: report.error?.code ?? null,
        errorMessage: report.error?.message ?? null,
        durationMs: report.durationMs,
        finishedAt: new Date(),
      }).where(eq(audits.id, audit.id));

      // Charge once per completed/partial scan; failed scans are free.
      if (report.status !== "failed") {
        await tx
          .insert(usageEvents)
          .values({ id: newId(), organizationId: audit.organizationId, auditId: audit.id, kind: "scan" })
          .onConflictDoNothing({ target: usageEvents.auditId });
      }
    });

    await db.update(scanJobs).set({ status: "done", updatedAt: new Date() }).where(eq(scanJobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown worker error";
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.update(scanJobs).set({ status: "failed", lastError: message, updatedAt: new Date() }).where(eq(scanJobs.id, job.id));
      await db.update(audits).set({
        status: "failed", errorCode: "WORKER_ERROR",
        errorMessage: "The scan couldn't be completed. Please try again.",
        finishedAt: new Date(),
      }).where(eq(audits.id, audit.id));
    } else {
      await db.update(scanJobs).set({ status: "queued", lastError: message, updatedAt: new Date() }).where(eq(scanJobs.id, job.id));
      await db.update(audits).set({ status: "queued" }).where(eq(audits.id, audit.id));
    }
  }
  return true;
}

let workerStarted = false;
let workerBusy = false;

async function drainQueue() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    while (await processNextScanJob()) { /* keep draining */ }
  } catch { /* loop guard: next tick retries */ } finally {
    workerBusy = false;
  }
}

export function kickWorker() {
  void drainQueue();
}

/** Starts the polling worker (idempotent). Called from instrumentation in the Node runtime. */
export function ensureScanWorker() {
  if (workerStarted) return;
  workerStarted = true;
  void drainQueue();
  const timer = setInterval(() => void drainQueue(), 3000);
  timer.unref?.();
}
