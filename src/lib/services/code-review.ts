import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { codeReviews } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import {
  analyzeCode,
  type CodeLanguage,
  type CodeReviewReport,
} from "@/lib/code-review-shared";

export { codeReviewToAgentPrompt, codeReviewToMarkdown } from "@/lib/code-review-shared";
export type { CodeReviewReport } from "@/lib/code-review-shared";

/**
 * Code Reviewer v1 (paste-based, deterministic). The submitted code
 * is analysed in memory and discarded — only the findings report is
 * persisted (see schema note). Available on every plan: it's a
 * taste-friendly utility, and its honesty note keeps expectations
 * calibrated (patterns, not a pentest).
 */

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
  return { id, report };
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
