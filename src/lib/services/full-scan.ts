import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { fullScans } from "@/lib/db/schema";
import { runScan } from "@/lib/scanner/scan";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";
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
  FullStages,
} from "@/lib/full-scan-shared";

export type { FullStages } from "@/lib/full-scan-shared";
export { buildTopFixes, fullScanToAgentPrompt, fullScanToMarkdown } from "@/lib/full-scan-shared";

/**
 * Full Scan — the Pro/Ultra all-in-one: Rules v5 audit + Flow Scan
 * (real browser) + AI-Pattern + Readiness in a single run, merged
 * into one scoreboard. Stages are ISOLATED: one engine failing never
 * fails the bundle; the stage records its honest error and the rest
 * complete. Charging: a single "full-scan" allowance (Pro 10/month,
 * Ultra unlimited) — component allowances are NOT burned inside a
 * bundle (explicit skipCharge/chargeAllowance flags), and if every
 * stage fails the allowance is refunded: we never charge for a run
 * that produced nothing.
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
  return row;
}

export async function listFullScans(organizationId: string, limit = 10, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select({
    id: fullScans.id, targetUrl: fullScans.targetUrl, status: fullScans.status,
    createdAt: fullScans.createdAt, finishedAt: fullScans.finishedAt,
  })
    .from(fullScans)
    .where(eq(fullScans.organizationId, organizationId))
    .orderBy(desc(fullScans.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

const MAX_STEPS = 60;
const errText = (err: unknown) =>
  err instanceof ScanError ? err.message : err instanceof Error ? err.message.split("\n")[0].slice(0, 200) : "Stage failed unexpectedly.";

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

  // ---- Stage 1: Rules v5 audit -------------------------------------------
  await push("Stage 1 of 4 — Rules v5 audit: crawling and checking the site…");
  try {
    const report = await runScan(row.targetUrl);
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

  // ---- Stage 2: Flow Scan (real browser) ----------------------------------
  await push("Stage 2 of 4 — Flow Scan: opening the real browser…");
  try {
    const { id: flowId } = await createFlowScan(organizationId, row.requestedBy, row.targetUrl, db, { skipAccessCheck: true });
    await runFlowScan(organizationId, flowId, db, { chargeAllowance: false });
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

  // ---- Stage 3: AI-Pattern -------------------------------------------------
  await push("Stage 3 of 4 — AI-Pattern: reading the copy for generic patterns…");
  try {
    const { id: aiId, report } = await runAndSaveAiPattern(organizationId, row.requestedBy, host, { skipCharge: true }, db);
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

  // ---- Stage 4: Readiness ---------------------------------------------------
  await push("Stage 4 of 4 — Readiness: stack, hosting, domain & email posture…");
  try {
    const { id: rdId, report } = await runAndSaveReadiness(organizationId, row.requestedBy, host, {}, db);
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

  const doneCount = [stages.audit, stages.flow, stages.ai, stages.readiness].filter((s) => s?.status === "done").length;
  if (doneCount === 0 && consumed) {
    // Every engine failed (e.g. target unreachable) — never charge for nothing.
    await refundPremiumRun(organizationId, "full-scan", db).catch(() => undefined);
  }
  await push(
    doneCount === 4
      ? "Full Scan complete — all four engines reported. Your unified scoreboard is ready."
      : `Full Scan finished with ${doneCount} of 4 stages complete — the report marks exactly what didn't run and why.`,
    doneCount === 0 ? "error" : "step",
  );
  await db.update(fullScans)
    .set({ status: "completed", stages, steps: [...steps], finishedAt: new Date() })
    .where(eq(fullScans.id, id));
}
