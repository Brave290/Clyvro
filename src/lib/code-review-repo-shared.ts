import {
  analyzeCode,
  scoreCodeFindings,
  type CodeFinding,
  type CodeLanguage,
} from "@/lib/code-review-shared";

/**
 * Whole-repository code review (GitHub bot). The same deterministic,
 * line-evidence engine as the paste reviewer — run over every
 * reviewable file in a repo instead of one pasted file. Findings gain
 * a file path; source is analysed in memory and never persisted — a
 * saved review keeps findings + stats only, exactly like v1.
 *
 * Honest scope (stated in every report): pattern matching over text,
 * no data-flow, no dependency audit, no execution. A clean result
 * means no known-bad patterns matched — not "this repo is secure".
 */

export const REPO_MAX_FILES = 150;
export const REPO_MAX_FILE_BYTES = 100_000;
export const REPO_MAX_TOTAL_BYTES = 1_200_000;
export const REPO_MAX_FINDINGS = 300;

export interface RepoTreeEntry {
  path: string;
  type: string; // "blob" | "tree" | …
  size?: number;
}

export interface RepoFileInput {
  path: string;
  content: string;
}

export interface RepoCodeFinding extends CodeFinding {
  file: string;
}

export interface RepoFileSummary {
  path: string;
  language: string;
  lines: number;
  findings: number;
}

export interface RepoReviewReport {
  filesScanned: number;
  filesSkipped: number;
  filesWithFindings: number;
  totalLines: number;
  truncated: boolean;
  score: number;
  findings: RepoCodeFinding[];
  counts: { critical: number; high: number; medium: number; low: number };
  files: RepoFileSummary[];
  note: string;
  /** Present on thorough GitHub/CLI walks — missing README/LICENSE/CI/tests/.gitignore/.env.example. */
  missing?: { path: string; why: string; severity: "high" | "medium" | "low" }[];
  env?: { used: { name: string; files: string[] }[]; exampleKeys: string[]; missingFromExample: string[] };
  vercel?: { present: boolean; note: string };
}

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|coverage|\.next|\.git|\.turbo|\.cache|__pycache__|target|bin|obj)(\/|$)/i;
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|go\.sum|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/i;
const MINIFIED = /\.min\.(js|css)$/i;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|bz2|7z|rar|woff2?|ttf|otf|eot|mp[34]|mov|avi|webm|wasm|class|jar|so|dll|exe|bin|dat|db|sqlite)$/i;

const EXT_LANGUAGE: Record<string, CodeLanguage> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", php: "php", go: "go",
};

export function repoLanguageForPath(path: string): CodeLanguage {
  const base = path.split("/").pop() ?? "";
  if (/^Dockerfile/i.test(base) || base === ".env" || base.startsWith(".env.")) return "other";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXT_LANGUAGE[ext] ?? "other";
}

const REVIEWABLE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|php|go|rb|java|c|h|cpp|hpp|cs|rs|sh|bash|zsh|sql|json|ya?ml|toml|html?|env|example)$/i;

/** Decide which tree entries get reviewed. Pure + bounded: file count, per-file size, total bytes. */
export function selectRepoFiles(tree: RepoTreeEntry[]): { selected: RepoTreeEntry[]; skipped: number } {
  const selected: RepoTreeEntry[] = [];
  let skipped = 0;
  let totalBytes = 0;
  const blobs = tree
    .filter((e) => e.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of blobs) {
    const base = entry.path.split("/").pop() ?? "";
    const reviewable =
      !SKIP_DIR.test(entry.path) &&
      !SKIP_FILE.test(entry.path) &&
      !MINIFIED.test(entry.path) &&
      !BINARY_EXT.test(entry.path) &&
      (REVIEWABLE_EXT.test(entry.path) || /^Dockerfile/i.test(base) || base === ".env" || base.startsWith(".env.")) &&
      (entry.size ?? 0) <= REPO_MAX_FILE_BYTES;
    if (!reviewable) { skipped++; continue; }
    if (selected.length >= REPO_MAX_FILES || totalBytes + (entry.size ?? 0) > REPO_MAX_TOTAL_BYTES) {
      skipped++;
      continue;
    }
    selected.push(entry);
    totalBytes += entry.size ?? 0;
  }
  return { selected, skipped };
}

export function analyzeRepository(files: RepoFileInput[], filesSkipped = 0): RepoReviewReport {
  const findings: RepoCodeFinding[] = [];
  const summaries: RepoFileSummary[] = [];
  let totalLines = 0;
  let truncated = false;
  for (const file of files) {
    const report = analyzeCode(file.content, repoLanguageForPath(file.path));
    totalLines += report.lines;
    summaries.push({ path: file.path, language: report.language, lines: report.lines, findings: report.findings.length });
    for (const f of report.findings) {
      if (findings.length >= REPO_MAX_FINDINGS) { truncated = true; break; }
      findings.push({ ...f, file: file.path });
    }
    if (findings.length >= REPO_MAX_FINDINGS) truncated = true;
  }
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  return {
    filesScanned: files.length,
    filesSkipped,
    filesWithFindings: summaries.filter((s) => s.findings > 0).length,
    totalLines,
    truncated,
    score: scoreCodeFindings(findings),
    findings,
    counts,
    files: summaries.sort((a, b) => b.findings - a.findings || a.path.localeCompare(b.path)),
    note:
      "Thorough walk of the repository tree (every path is inventoried for missing README/LICENSE/CI/tests/.gitignore, then reviewable source is pattern-matched). " +
      "The bot reads code as text: it doesn't run it, follow data flow between files, or audit dependencies. " +
      "A clean result means no known-bad patterns were matched and the obvious files were present, not that the code is secure. Source is analysed in memory and never stored; only findings are saved. AI-on-evidence and live Vercel env compare come later.",
  };
}

export function repoReviewToMarkdown(repoFullName: string, commitSha: string | null, report: RepoReviewReport): string {
  const lines: string[] = [
    `# Code review — ${repoFullName}${commitSha ? ` @ ${commitSha.slice(0, 7)}` : ""}`,
    "",
    `${report.filesScanned} files · ${report.totalLines} lines · Score ${report.score}/100 · ` +
      `${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium, ${report.counts.low} low` +
      (report.truncated ? ` · findings capped at ${REPO_MAX_FINDINGS}` : ""),
    "",
    `_${report.note}_`,
    "",
  ];
  if (!report.findings.length) lines.push("No known-bad patterns matched in the reviewed files.");
  let currentFile = "";
  for (const f of report.findings) {
    if (f.file !== currentFile) { currentFile = f.file; lines.push(`## ${f.file}`, ""); }
    lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} — ${f.evidence} Fix: ${f.recommendation}`);
  }
  return lines.join("\n");
}

export function repoReviewToAgentPrompt(repoFullName: string, commitSha: string | null, report: RepoReviewReport): string {
  const lines: string[] = [
    `You are fixing findings from a Clyvro whole-repo Code Review of "${repoFullName}"${commitSha ? ` at commit ${commitSha.slice(0, 7)}` : ""} (${report.filesScanned} files, ${report.totalLines} lines, score ${report.score}/100). Pattern-based evidence is quoted per file + line.`,
    "",
    "Rules:",
    "1. Open each cited file + line and confirm the pattern in context before changing anything; if a finding is a false positive in context, say so with the reason instead of changing code blindly.",
    "2. Secrets flagged as hardcoded must be rotated, not just moved — assume they are compromised.",
    "3. Work file by file; show diffs and wait for my approval before committing.",
    "",
    "Findings:",
  ];
  if (!report.findings.length) lines.push("- None. Confirm nothing regressed and summarise what you checked.");
  for (const f of report.findings) lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.file} — ${f.title} — ${f.evidence} Fix: ${f.recommendation}`);
  return lines.join("\n");
}
