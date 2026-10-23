import { and, count, desc, eq, gt } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { fullScans } from "@/lib/db/schema";
import { normalizeScanInput, runScan, runScanSlice } from "@/lib/scanner/scan";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { isDomainVerified } from "@/lib/services/domain-verification";
import { runHackProtectionEngine } from "@/lib/services/hack-protection";
import { strictSecurityScore } from "@/lib/types";
import { ScanError, type ScanCheckpoint } from "@/lib/scanner/types";
import {
  consumePremiumRun,
  premiumAccess,
  refundPremiumRun,
  type PremiumAccess,
} from "@/lib/services/tool-access";
import { createFlowScan, getFlowScan, runFlowScan } from "@/lib/services/flow-scan";
import { runAndSaveAiPattern } from "@/lib/services/ai-pattern";
import { runAndSaveReadiness } from "@/lib/services/readiness";
import type { FlowStep } from "@/lib/flow-scan-shared";
import type {
  FullAuditStage,
  FullAiStage,
  FullFlowStage,
  FullReadinessStage,
  FullSecurityStage,
  FullStages,
} from "@/lib/full-scan-shared";

export type { FullStages } from "@/lib/full-scan-shared";
export { buildTopFixes, fullScanToAgentPrompt, fullScanToMarkdown } from "@/lib/full-scan-shared";

/**
 * Full Scan — the Pro/Agency all-in-one: rules audit + strict
 * security (hidden paths, locks, detection probes on verified sites)
 * + Flow Scan + AI-Pattern + Readiness. Not labelled as a pentest.
 * Stages are ISOLATED. Charging: a single "full-scan" allowance
 * (Pro and Agency unlimited). Component allowances are NOT burned
 * inside a bundle; if every stage fails the allowance is refunded.
 */

export type FullScanAccess = PremiumAccess;

export async function fullScanAccess(organizationId: string, dbOverride?: DB): Promise<FullScanAccess> {
  return premiumAccess(organizationId, "full-scan", dbOverride);
}

export async function createFullScan(
  organizationId: string, userId: string, rawUrl: string, dbOverride?: DB,
): Promise<{ id: string }> {
  const db = dbOverride ?? (await getDb());
  const access = await fullScanAccess(organizationId, db);
  if (!access.allowed) {
    if ((access.limit ?? 0) === 0) {
      throw new ScanError(
        "PLAN_LIMIT",
        `Full Scan is a Pro and Ultra Agency feature — your workspace is on the ${access.planName} plan. Every other tool stays open to test on your plan; upgrading to Pro unlocks the all-in-one bundle.`,
      );
    }
    await consumePremiumRun(organizationId, "full-scan", db); // throws the friendly cap message
  }
  const target = await assertPublicUrl(normalizeScanInput(rawUrl.trim()));
  const id = newId();
  await db.insert(fullScans).values({
    id, organizationId, requestedBy: userId,
    targetUrl: target.url.href, status: "queued", steps: [],
  });
  return { id };
}

export async function getFullScan(organizationId: string, id: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(fullScans)
    .where(and(eq(fullScans.id, id), eq(fullScans.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Full scan not found.");
  return recoverIfStale(row, db);
}

export async function listFullScans(organizationId: string, limit = 10, dbOverride?: DB, page = 1) {
  const db = dbOverride ?? (await getDb());
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const safePage = Math.max(page, 1);
  const [{ total }] = await db.select({ total: count() }).from(fullScans).where(eq(fullScans.organizationId, organizationId));
  const raw = await db.select()
    .from(fullScans)
    .where(eq(fullScans.organizationId, organizationId))
    .orderBy(desc(fullScans.createdAt))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);
  const recovered = await Promise.all(raw.map((r) => recoverIfStale(r, db)));
  const history = recovered.map((r) => ({
    id: r.id, targetUrl: r.targetUrl, status: r.status,
    createdAt: r.createdAt, finishedAt: r.finishedAt,
  }));
  return { history, pagination: { page: safePage, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
}

const MAX_STEPS = 60;
/** Vercel kills /run at 300s. If no new step in this window, the process is dead. */
export const FULL_SCAN_STALE_MS = 4 * 60 * 1000;
const QUEUED_STALE_MS = 90 * 1000;
/** Stage 1 used to call runOwnedSiteScan (up to 48 × 45s slices) and never return before the platform cut the request. */
const AUDIT_BUDGET_MS = 75_000;
const AUDIT_MAX_SLICES = 3;
const SECURITY_BUDGET_MS = 35_000;
const FLOW_BUDGET_MS = 90_000;
const AI_BUDGET_MS = 25_000;
const READINESS_BUDGET_MS = 25_000;
const errText = (err: unknown) =>
  err instanceof ScanError ? err.message : err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "Stage failed unexpectedly.";

function lastActivityMs(row: { steps: unknown; createdAt: Date | string }): number {
  const steps = Array.isArray(row.steps) ? (row.steps as FlowStep[]) : [];
  const stamp = steps.length ? steps[steps.length - 1]?.at : null;
  const fromStep = stamp ? Date.parse(stamp) : NaN;
  if (Number.isFinite(fromStep)) return fromStep;
  const created = row.createdAt instanceof Date ? row.createdAt.getTime() : Date.parse(String(row.createdAt));
  return Number.isFinite(created) ? created : 0;
}

/** Why a queued/running Full Scan should be marked failed. Null = still legitimately in flight. */
export function fullScanStaleReason(
  row: { status: string; steps: unknown; createdAt: Date | string },
  now = Date.now(),
): string | null {
  if (row.status === "queued" && now - lastActivityMs(row) > QUEUED_STALE_MS) {
    return "The runner never started (the tab may have closed before the scan kicked off). Run it again.";
  }
  if (row.status === "running" && now - lastActivityMs(row) > FULL_SCAN_STALE_MS) {
    return "The scan was cut off on the server while still on an early stage — usually a hung crawl. Nothing after that ran. Try again.";
  }
  return null;
}

async function recoverIfStale<T extends {
  id: string; status: string; steps: unknown; createdAt: Date | string;
  errorMessage: string | null; organizationId: string; stages: unknown;
}>(row: T, db: DB): Promise<T> {
  const reason = fullScanStaleReason(row);
  if (!reason) return row;
  const steps = [...(Array.isArray(row.steps) ? (row.steps as FlowStep[]) : [])];
  if (steps.length < MAX_STEPS) steps.push({ at: new Date().toISOString(), label: reason, level: "error" });
  const finishedAt = new Date();
  await db.update(fullScans)
    .set({ status: "failed", errorMessage: reason, finishedAt, steps })
    .where(eq(fullScans.id, row.id));
  const stages = row.stages && typeof row.stages === "object" ? row.stages as FullStages : null;
  const anyDone = stages ? Object.values(stages).some((s) => s?.status === "done") : false;
  if (!anyDone && row.status === "running") {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const [newer] = await db.select({ id: fullScans.id }).from(fullScans)
      .where(and(eq(fullScans.organizationId, row.organizationId), gt(fullScans.createdAt, createdAt)))
      .limit(1);
    if (!newer) await refundPremiumRun(row.organizationId, "full-scan", db).catch(() => undefined);
  }
  return { ...row, status: "failed", errorMessage: reason, finishedAt, steps };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ScanError("TIMEOUT", `${label} hit its time box so the other engines can still run.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Owned full-site crawl, capped so it cannot consume the whole 300s serverless budget. */
async function runBoundedOwnedAudit(
  targetUrl: string,
  push: (label: string, level?: FlowStep["level"], detail?: string) => Promise<void>,
) {
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), AUDIT_BUDGET_MS);
  try {
    let checkpoint: ScanCheckpoint | undefined;
    let last: Awaited<ReturnType<typeof runScanSlice>> | null = null;
    for (let i = 0; i < AUDIT_MAX_SLICES; i++) {
      const remaining = AUDIT_BUDGET_MS - (Date.now() - started);
      if (remaining < 8_000 || ac.signal.aborted) break;
      last = await withTimeout(runScanSlice(targetUrl, {
        checkpoint,
        sitemap: true,
        vulnProbes: true,
        ownerDeep: true,
        workBudget: 40,
        limits: { maxPages: 80, maxLinkChecks: 200, maxDepth: 3 },
        signal: ac.signal,
      }), remaining, "The full-site audit");
      if (last.done) {
        if (!last.report) throw new ScanError("CHECKPOINT_INVALID", "Owned-site audit finished without a report.");
        return last.report;
      }
      checkpoint = last.checkpoint ?? undefined;
      const pages = checkpoint?.crawl.pages.length ?? 0;
      await push(`Stage 1 still crawling — ${pages} page(s) so far, slice ${i + 1} of ${AUDIT_MAX_SLICES}…`);
    }
    if (last?.checkpoint) {
      await push("Stage 1 time box reached — scoring the pages already fetched…");
      last = await runScanSlice(targetUrl, {
        checkpoint: { ...last.checkpoint, deadlineAt: Date.now() },
        sitemap: true,
        vulnProbes: true,
        ownerDeep: true,
        workBudget: 1,
        limits: last.checkpoint.limits,
      });
    }
    if (last?.done && last.report) return last.report;
    throw new ScanError("TIMEOUT", "The full-site audit used its time box so the other engines can still run.");
  } catch (err) {
    if (err instanceof ScanError) throw err;
    if (ac.signal.aborted) {
      throw new ScanError("TIMEOUT", "The full-site audit used its time box so the other engines can still run.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (!ac.signal.aborted) ac.abort();
  }
}

/** Executes a queued Full Scan. Updates the row (and its live step log) as stages complete. */
export async function runFullScan(organizationId: string, id: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const row = await getFullScan(organizationId, id, db);
  if (row.status !== "queued") return;

  let consumed = false;
  try {
    await consumePremiumRun(organizationId, "full-scan", db);
    consumed = true;
  } catch (err) {
    await db.update(fullScans)
      .set({ status: "failed", errorMessage: errText(err), finishedAt: new Date() })
      .where(eq(fullScans.id, id));
    return;
  }

  const steps: FlowStep[] = [];
  const push = async (label: string, level: FlowStep["level"] = "step", detail?: string) => {
    if (steps.length >= MAX_STEPS) return;
    steps.push({ at: new Date().toISOString(), label, level, detail });
    await db.update(fullScans).set({ steps: [...steps] }).where(eq(fullScans.id, id));
  };
  await db.update(fullScans).set({ status: "running", steps: [] }).where(eq(fullScans.id, id));

  const stages: FullStages = {};
  const saveStages = () => db.update(fullScans).set({ stages }).where(eq(fullScans.id, id));
  const host = (() => { try { return new URL(row.targetUrl).hostname; } catch { return row.targetUrl; } })();
  const stillRunning = async () => {
    const [live] = await db.select({ status: fullScans.status }).from(fullScans).where(eq(fullScans.id, id)).limit(1);
    return live?.status === "running";
  };

  const verified = await isDomainVerified(organizationId, row.targetUrl, db);

  try {

  // ---- Stage 1: Rules audit (time-boxed — never 48 owned-site slices) ----
  await push(verified
    ? "Stage 1 of 5 — Full-site audit: sitemap, hidden paths, pages we can reach in the time box…"
    : "Stage 1 of 5 — Rules audit: crawling and checking the site…");
  try {
    const report = verified
      ? await runBoundedOwnedAudit(row.targetUrl, push)
      : await withTimeout(runScan(row.targetUrl), AUDIT_BUDGET_MS, "The rules audit");
    const stage: FullAuditStage = {
      status: report.status === "failed" ? "failed" : "done",
      error: report.status === "failed" ? (report.error?.message ?? "The audit couldn't complete.") : undefined,
      score: report.score,
      findings: report.findings.length,
      pages: report.coverage.pagesParsed,
      topFindings: report.findings.slice(0, 8).map((f) => ({
        ruleId: f.ruleId, severity: f.severity, title: f.title, page: f.page, recommendation: f.recommendation,
      })),
    };
    stages.audit = stage;
    await push(
      stage.status === "done"
        ? `Audit complete — score ${stage.score ?? "—"}/100, ${stage.findings} finding(s) over ${stage.pages} page(s)`
        : `Audit couldn't complete — ${stage.error}`,
      stage.status === "done" ? "step" : "error",
    );
  } catch (err) {
    stages.audit = { status: "failed", error: errText(err), score: null, findings: 0, pages: 0, topFindings: [] };
    await push(`Audit stage failed — ${errText(err)} The other stages still run.`, "error");
  }
  await saveStages();

  // ---- Stage 2: Strict security -------------------------------------------
  if (!(await stillRunning())) return;
  await push("Stage 2 of 5 — Strict security: locks, sensitive files, detection probes…");
  try {
    const hack = await withTimeout(runHackProtectionEngine(row.targetUrl), SECURITY_BUDGET_MS, "Strict security");
    const auditFindings = stages.audit?.topFindings ?? [];
    const fail = hack.summary.fail;
    const warn = hack.summary.warn;
    const synthetic = auditFindings.map((f) => ({
      severity: f.severity as "critical" | "high" | "medium" | "low",
    }));
    const score = strictSecurityScore(
      synthetic.map((f) => ({
        ruleId: "", ruleVersion: "", page: "", category: "Reliability", severity: f.severity,
        confidenceBasis: "confirmed", title: "", explanation: "", evidence: [], recommendation: "",
        effort: "Minutes", impactRationale: "",
      })),
      fail,
      warn,
    );
    const exposed = hack.probedPaths.filter((p) => p.status !== null && p.status >= 200 && p.status < 300);
    const extraFindings = hack.checks.filter((c) => c.status === "fail" || c.status === "warn").slice(0, 8).map((c) => ({
      ruleId: c.id, severity: c.status === "fail" ? "high" : "medium", title: c.label, page: "/", recommendation: (c.fix ?? []).join(" "),
    }));
    const stage: FullSecurityStage = {
      status: "done",
      score,
      findings: extraFindings.length + (stages.audit?.findings ?? 0),
      pages: stages.audit?.pages ?? 0,
      hiddenPaths: exposed.length,
      verified,
      topFindings: extraFindings,
      error: verified ? undefined : "Verify this domain to include hidden/admin paths and detection probes. Safety locks still ran.",
    };
    stages.security = stage;
    await push(
      `Strict security score ${score}/100 — ${fail} failing lock(s), ${warn} warning(s)${verified ? "" : " (verify the domain for the full hidden-path pass)"}`,
      fail > 0 ? "note" : "step",
    );
  } catch (err) {
    stages.security = { status: "failed", error: errText(err), score: null, findings: 0, pages: 0, hiddenPaths: 0, verified, topFindings: [] };
    await push(`Strict security stage failed — ${errText(err)}`, "error");
  }
  await saveStages();

  // ---- Stage 3: Flow Scan (real browser) ----------------------------------
  if (!(await stillRunning())) return;
  await push("Stage 3 of 5 — Flow Scan: opening the real browser…");
  try {
    const { id: flowId } = await createFlowScan(organizationId, row.requestedBy, row.targetUrl, db, { skipAccessCheck: true });
    stages.flow = { status: "running", scanId: flowId, pages: 0, flaws: [], notes: 0 };
    await saveStages();
    await withTimeout(runFlowScan(organizationId, flowId, db, { chargeAllowance: false }), FLOW_BUDGET_MS, "Flow Scan");
    const flow = await getFlowScan(organizationId, flowId, db);
    if (flow.status === "completed" && flow.report) {
      const r = flow.report as {
        pages: unknown[]; notes: string[];
        uiDiscrepancies?: { level: string; title: string; evidence: string; recommendation: string }[];
      };
      stages.flow = {
        status: "done",
        scanId: flowId,
        pages: r.pages.length,
        flaws: (r.uiDiscrepancies ?? []).filter((d) => d.level === "flaw")
          .map((d) => ({ title: d.title, evidence: d.evidence, recommendation: d.recommendation })),
        notes: r.notes.length,
      } satisfies FullFlowStage;
      await push(`Flow Scan complete — ${r.pages.length} page(s) rendered, ${stages.flow.flaws.length} UI flaw(s) measured`);
    } else {
      stages.flow = { status: "failed", error: flow.errorMessage ?? "The browser stage didn't complete.", scanId: flowId, pages: 0, flaws: [], notes: 0 };
      await push(`Flow Scan stage failed — ${stages.flow.error} The other stages still count.`, "error");
    }
  } catch (err) {
    stages.flow = { status: "failed", error: errText(err), scanId: null, pages: 0, flaws: [], notes: 0 };
    await push(`Flow Scan stage failed — ${errText(err)}`, "error");
  }
  await saveStages();

  // ---- Stage 4: AI-Pattern -------------------------------------------------
  if (!(await stillRunning())) return;
  await push("Stage 4 of 5 — AI-Pattern: reading the copy for generic patterns…");
  try {
    const { id: aiId, report } = await withTimeout(runAndSaveAiPattern(organizationId, row.requestedBy, host, { skipCharge: true }, db), AI_BUDGET_MS, "AI-Pattern");
    stages.ai = {
      status: "done", checkId: aiId, score: report.score, band: report.band,
      topSignals: report.signals.slice(0, 4).map((s) => s.label),
    } satisfies FullAiStage;
    await push(`AI-Pattern complete — ${report.score}/100 (${report.band})`);
  } catch (err) {
    stages.ai = { status: "failed", error: errText(err), checkId: null, score: 0, band: "—", topSignals: [] };
    await push(`AI-Pattern stage failed — ${errText(err)}`, "error");
  }
  await saveStages();

  // ---- Stage 5: Readiness ---------------------------------------------------
  if (!(await stillRunning())) return;
  await push("Stage 5 of 5 — Readiness: stack, hosting, domain & email posture…");
  try {
    const { id: rdId, report } = await withTimeout(runAndSaveReadiness(organizationId, row.requestedBy, host, {}, db), READINESS_BUDGET_MS, "Readiness");
    stages.readiness = {
      status: "done", checkId: rdId, tier: report.tier,
      pass: report.summary.pass, warn: report.summary.warn, fail: report.summary.fail,
      topFails: report.checks.filter((c) => c.status === "fail").slice(0, 5).map((c) => c.label),
    } satisfies FullReadinessStage;
    await push(`Readiness complete (${report.tier}) — ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`);
  } catch (err) {
    stages.readiness = { status: "failed", error: errText(err), checkId: null, tier: "—", pass: 0, warn: 0, fail: 0, topFails: [] };
    await push(`Readiness stage failed — ${errText(err)}`, "error");
  }
  await saveStages();

  const doneCount = [stages.audit, stages.security, stages.flow, stages.ai, stages.readiness].filter((s) => s?.status === "done").length;
  if (doneCount === 0 && consumed) {
    // Every engine failed (e.g. target unreachable) — never charge for nothing.
    await refundPremiumRun(organizationId, "full-scan", db).catch(() => undefined);
  }
  await push(
    doneCount === 5
      ? "Full Scan complete — all five engines reported. Your unified scoreboard is ready."
      : `Full Scan finished with ${doneCount} of 5 stages complete — the report marks exactly what didn't run and why.`,
    doneCount === 0 ? "error" : "step",
  );
  if (!(await stillRunning())) return;
  await db.update(fullScans)
    .set({ status: "completed", stages, steps: [...steps], finishedAt: new Date() })
    .where(eq(fullScans.id, id));
  } catch (err) {
    const message = errText(err);
    const doneCount = [stages.audit, stages.security, stages.flow, stages.ai, stages.readiness].filter((s) => s?.status === "done").length;
    if (doneCount === 0 && consumed) {
      await refundPremiumRun(organizationId, "full-scan", db).catch(() => undefined);
    }
    if (steps.length < MAX_STEPS) {
      steps.push({ at: new Date().toISOString(), label: `Full Scan stopped — ${message}`, level: "error" });
    }
    await db.update(fullScans)
      .set({ status: doneCount > 0 ? "completed" : "failed", stages, steps: [...steps], errorMessage: doneCount > 0 ? null : message, finishedAt: new Date() })
      .where(eq(fullScans.id, id));
  }
}
