import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { codeReviews, users } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import {
  analyzeCode,
  type CodeLanguage,
  type CodeReviewReport,
} from "@/lib/code-review-shared";
import type { ThoroughReport } from "@/lib/code-review-thorough";
import { enqueueUserNotification, flushNotificationOutbox } from "@/lib/services/notifications";

export { codeReviewToAgentPrompt, codeReviewToMarkdown } from "@/lib/code-review-shared";
export type { CodeReviewReport } from "@/lib/code-review-shared";

/**
 * Code Reviewer — paste, CLI/MCP workspace walk, GitHub bot.
 * Source is analysed in memory and discarded — only the findings
 * report is persisted. Available on every plan. Deterministic
 * patterns, not an AI and not a pentest.
 */

async function emailReviewReady(
  organizationId: string, userId: string, id: string, title: string, score: number,
  extra: string, db: DB,
) {
  const [requester] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!requester?.email) return;
  await enqueueUserNotification({
    organizationId, userId, category: "scanResults",
    kind: "code_review_completed",
    dedupeKey: `code-review:${id}`,
    toEmail: requester.email,
    subject: `Code review ready: ${title} (${score}/100)`,
    body: `Your Clyvro Code Review "${title}" finished with score ${score}/100. ${extra} Open Code Reviewer in Clyvro for the full report. Source was never stored.`,
  }, db).catch(() => false);
  await flushNotificationOutbox({ limit: 3 }, db).catch(() => undefined);
}

export async function runAndSaveCodeReview(
  organizationId: string, userId: string,
  input: { title?: string; language?: CodeLanguage; code: string },
  dbOverride?: DB,
): Promise<{ id: string; report: CodeReviewReport }> {
  const code = (input.code ?? "").trim();
  if (code.length < 10) throw new ScanError("VALIDATION", "Paste at least a few lines of code to review.");
  if (code.length > 220_000) throw new ScanError("VALIDATION", "That paste is too large for one review (max ~200 KB). Split it by file.");
  const report = analyzeCode(code, input.language ?? "auto");
  const db = dbOverride ?? (await getDb());
  const id = newId();
  const title = (input.title ?? "").trim().slice(0, 120) || `Untitled ${report.language} review`;
  const summary = {
    score: report.score, ...report.counts, lines: report.lines, language: report.language,
  };
  await db.insert(codeReviews).values({
    id, organizationId, requestedBy: userId, title,
    language: report.language, results: report, summary,
  });
  await emailReviewReady(
    organizationId, userId, id, title, report.score,
    `${report.findings.length} finding(s) in ${report.lines} lines.`, db,
  );
  return { id, report };
}

/** Persist a CLI/MCP thorough walk. Source never arrives — findings only. */
export async function saveThoroughReview(
  organizationId: string, userId: string,
  input: { title?: string; report: ThoroughReport },
  dbOverride?: DB,
): Promise<{ id: string }> {
  const report = input.report;
  if (!report || typeof report !== "object" || !Array.isArray(report.findings)) {
    throw new ScanError("VALIDATION", "Send the Code Reviewer report (findings only — never source).");
  }
  if (typeof report.filesReviewed !== "number" || typeof report.score !== "number") {
    throw new ScanError("VALIDATION", "That report is missing score / filesReviewed.");
  }
  // Drop anything that looks like source, just in case a client sent it.
  const safe: ThoroughReport = {
    rootName: String(report.rootName ?? "workspace").slice(0, 200),
    filesSeen: Number(report.filesSeen) || 0,
    filesReviewed: Number(report.filesReviewed) || 0,
    filesSkipped: Number(report.filesSkipped) || 0,
    totalLines: Number(report.totalLines) || 0,
    truncated: !!report.truncated,
    score: Math.max(0, Math.min(100, Number(report.score) || 0)),
    findings: (report.findings ?? []).slice(0, 400).map((f) => ({
      ruleId: String(f.ruleId ?? "").slice(0, 20),
      severity: f.severity,
      confidenceBasis: f.confidenceBasis,
      line: Number(f.line) || 0,
      title: String(f.title ?? "").slice(0, 200),
      evidence: String(f.evidence ?? "").slice(0, 240),
      recommendation: String(f.recommendation ?? "").slice(0, 400),
      file: String(f.file ?? "").slice(0, 300),
    })),
    counts: {
      critical: Number(report.counts?.critical) || 0,
      high: Number(report.counts?.high) || 0,
      medium: Number(report.counts?.medium) || 0,
      low: Number(report.counts?.low) || 0,
    },
    missing: (report.missing ?? []).slice(0, 40).map((m) => ({
      path: String(m.path ?? "").slice(0, 200),
      why: String(m.why ?? "").slice(0, 400),
      severity: m.severity,
    })),
    env: {
      used: (report.env?.used ?? []).slice(0, 80).map((u) => ({
        name: String(u.name ?? "").slice(0, 80),
        files: (u.files ?? []).slice(0, 8).map((p) => String(p).slice(0, 300)),
      })),
      exampleKeys: (report.env?.exampleKeys ?? []).slice(0, 80).map((k) => String(k).slice(0, 80)),
      missingFromExample: (report.env?.missingFromExample ?? []).slice(0, 80).map((k) => String(k).slice(0, 80)),
    },
    vercel: {
      present: !!report.vercel?.present,
      note: String(report.vercel?.note ?? "").slice(0, 400),
    },
    note: String(report.note ?? "").slice(0, 800),
  };
  const db = dbOverride ?? (await getDb());
  const id = newId();
  const title = (input.title ?? "").trim().slice(0, 120) || `Code review — ${safe.rootName}`;
  const summary = {
    score: safe.score, ...safe.counts,
    filesReviewed: safe.filesReviewed, filesSeen: safe.filesSeen, language: "workspace",
  };
  await db.insert(codeReviews).values({
    id, organizationId, requestedBy: userId, title,
    language: "workspace", results: safe, summary,
  });
  await emailReviewReady(
    organizationId, userId, id, title, safe.score,
    `${safe.filesReviewed} files reviewed, ${safe.missing.length} missing-file note(s).`, db,
  );
  return { id };
}

export async function listCodeReviews(organizationId: string, limit = 10, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select({
    id: codeReviews.id, title: codeReviews.title, language: codeReviews.language,
    summary: codeReviews.summary, createdAt: codeReviews.createdAt,
  })
    .from(codeReviews)
    .where(eq(codeReviews.organizationId, organizationId))
    .orderBy(desc(codeReviews.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

export async function getCodeReview(organizationId: string, id: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(codeReviews)
    .where(and(eq(codeReviews.id, id), eq(codeReviews.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Code review not found.");
  return row;
}
