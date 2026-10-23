import { analyzeCode, scoreCodeFindings, type CodeFinding } from "@/lib/code-review-shared";
import { repoLanguageForPath, type RepoCodeFinding, type RepoFileInput } from "@/lib/code-review-repo-shared";

/**
 * Thorough Code Reviewer — inventory + env-name pass over a whole tree,
 * then the same line-evidence engine on reviewable source. This is a
 * long walk of real files (CLI on disk, GitHub via the bot), not an
 * instant paste nit. v1 is deterministic and writes a report only (no auto-fix,
 * no auto-PR). Source is never stored.
 */

export interface MissingFile {
  path: string;
  why: string;
  severity: "high" | "medium" | "low";
}

export interface EnvUse {
  name: string;
  files: string[];
}

export interface ThoroughInventory {
  filesSeen: number;
  hasReadme: boolean;
  hasLicense: boolean;
  hasGitignore: boolean;
  hasCi: boolean;
  hasTests: boolean;
  hasEnvExample: boolean;
  hasVercel: boolean;
  projectKind: string | null;
  missing: MissingFile[];
  vercelNote: string;
}

export interface ThoroughReport {
  rootName: string;
  filesSeen: number;
  filesReviewed: number;
  filesSkipped: number;
  totalLines: number;
  truncated: boolean;
  score: number;
  findings: RepoCodeFinding[];
  counts: { critical: number; high: number; medium: number; low: number };
  missing: MissingFile[];
  env: { used: EnvUse[]; exampleKeys: string[]; missingFromExample: string[] };
  vercel: { present: boolean; note: string };
  note: string;
}

const README = /(^|\/)README(\.[a-z0-9]+)?$/i;
const LICENSE = /(^|\/)LICEN[CS]E(\.[a-z0-9]+)?$/i;
const GITIGNORE = /(^|\/)\.gitignore$/;
const ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template)$/i;
const VERCEL = /(^|\/)vercel\.json$|(^|\/)\.vercel\/project\.json$/;
const CI = /(^|\/)\.github\/workflows\/.+\.(yml|yaml)$|(^|\/)\.gitlab-ci\.yml$|(^|\/)\.circleci\/|(^|\/)bitbucket-pipelines\.yml$|(^|\/)azure-pipelines\.ya?ml$/i;
const TEST = /(^|\/)(__tests__|tests|spec)(\/|$)|(^|\/)test\/|\.(test|spec)\.[a-z0-9]+$/i;

const PROJECT_MARKERS: { file: RegExp; kind: string }[] = [
  { file: /(^|\/)package\.json$/, kind: "node" },
  { file: /(^|\/)pyproject\.toml$|(^|\/)requirements\.txt$|(^|\/)Pipfile$/, kind: "python" },
  { file: /(^|\/)go\.mod$/, kind: "go" },
  { file: /(^|\/)Cargo\.toml$/, kind: "rust" },
  { file: /(^|\/)composer\.json$/, kind: "php" },
  { file: /(^|\/)Gemfile$/, kind: "ruby" },
  { file: /(^|\/)pubspec\.yaml$/, kind: "dart" },
];

export function inventoryFromPaths(paths: string[]): ThoroughInventory {
  const filesSeen = paths.length;
  const hasReadme = paths.some((p) => README.test(p));
  const hasLicense = paths.some((p) => LICENSE.test(p));
  const hasGitignore = paths.some((p) => GITIGNORE.test(p));
  const hasCi = paths.some((p) => CI.test(p));
  const hasTests = paths.some((p) => TEST.test(p));
  const hasEnvExample = paths.some((p) => ENV_EXAMPLE.test(p));
  const hasVercel = paths.some((p) => VERCEL.test(p));
  const projectKind = PROJECT_MARKERS.find((m) => paths.some((p) => m.file.test(p)))?.kind ?? null;

  const missing: MissingFile[] = [];
  if (projectKind && !hasReadme) {
    missing.push({
      path: "README.md",
      severity: "medium",
      why: "No README. People (and future you) need a short “what this is / how to run it” at the repo root.",
    });
  }
  if (projectKind && !hasLicense) {
    missing.push({
      path: "LICENSE",
      severity: "low",
      why: "No license file. Without one, others cannot tell whether they may use, fork, or sell this code.",
    });
  }
  if (!hasGitignore) {
    missing.push({
      path: ".gitignore",
      severity: "high",
      why: "No .gitignore. Secrets, node_modules, and build output are one `git add .` away from being committed.",
    });
  }
  if (projectKind && !hasCi) {
    missing.push({
      path: ".github/workflows/",
      severity: "medium",
      why: "No CI workflow. Tests and lint never run on a pull request unless someone remembers to do it by hand.",
    });
  }
  if (projectKind && !hasTests) {
    missing.push({
      path: "tests/",
      severity: "medium",
      why: "No test files showed up (no tests/, __tests__/, or *.test.* / *.spec.*). A thorough review cannot prove behaviour without them.",
    });
  }

  const vercelNote = hasVercel
    ? "Vercel project files found. Comparing live env names from your Vercel project is a later step — this pass only matches names used in code against .env.example."
    : "No vercel.json. If you deploy on Vercel, connecting the project for live env names ships later; this pass only reads the tree.";

  return {
    filesSeen, hasReadme, hasLicense, hasGitignore, hasCi, hasTests, hasEnvExample, hasVercel, projectKind, missing, vercelNote,
  };
}

const ENV_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
  /os\.environ(?:\.get)?\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /os\.Getenv\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /\$_(?:ENV|SERVER)\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
  /Deno\.env\.get\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  /getenv\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
];

const SKIP_ENV = new Set(["NODE_ENV", "PATH", "HOME", "PWD", "USER", "SHELL", "TMPDIR", "TERM"]);

export function extractEnvNames(content: string): string[] {
  const names = new Set<string>();
  for (const re of ENV_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const name = m[1];
      if (name && !SKIP_ENV.has(name)) names.add(name);
    }
  }
  return [...names].sort();
}

export function parseDotEnvKeys(content: string): string[] {
  const keys = new Set<string>();
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/);
    if (m) keys.add(m[1]);
  }
  return [...keys].sort();
}

export function collectEnvFromFiles(files: RepoFileInput[]): {
  used: EnvUse[];
  exampleKeys: string[];
  missingFromExample: string[];
} {
  const usedMap = new Map<string, Set<string>>();
  const exampleKeys = new Set<string>();
  for (const file of files) {
    const base = file.path.split("/").pop() ?? "";
    if (ENV_EXAMPLE.test(file.path) || /^\.env\.(example|sample|template)$/i.test(base)) {
      for (const k of parseDotEnvKeys(file.content)) exampleKeys.add(k);
    }
    for (const name of extractEnvNames(file.content)) {
      if (!usedMap.has(name)) usedMap.set(name, new Set());
      usedMap.get(name)!.add(file.path);
    }
  }
  const used: EnvUse[] = [...usedMap.entries()]
    .map(([name, filesSet]) => ({ name, files: [...filesSet].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const missingFromExample = used.map((u) => u.name).filter((n) => !exampleKeys.has(n));
  return { used, exampleKeys: [...exampleKeys].sort(), missingFromExample };
}

export function thoroughNote(): string {
  return (
    "Read every line of every reviewable file, detected its language, found bugs, and included the fix for each. " +
    "Missing README/LICENSE/CI/tests/.gitignore and env names vs .env.example are listed too. Source is analysed in memory and never stored."
  );
}

export function buildThoroughReport(input: {
  rootName: string;
  paths: string[];
  files: RepoFileInput[];
  filesSkipped: number;
  truncated?: boolean;
}): ThoroughReport {
  const inventory = inventoryFromPaths(input.paths);
  const findings: RepoCodeFinding[] = [];
  let totalLines = 0;
  let truncated = !!input.truncated;
  const MAX = 800;
  for (const file of input.files) {
    const report = analyzeCode(file.content, repoLanguageForPath(file.path));
    totalLines += report.lines;
    for (const f of report.findings) {
      if (findings.length >= MAX) { truncated = true; break; }
      findings.push({ ...f, file: file.path });
    }
    if (findings.length >= MAX) truncated = true;
  }
  const env = collectEnvFromFiles(input.files);
  const missing = [...inventory.missing];
  if (env.used.length > 0 && !inventory.hasEnvExample) {
    missing.push({
      path: ".env.example",
      severity: "high",
      why: `Code reads ${env.used.length} environment variable${env.used.length === 1 ? "" : "s"} but there is no .env.example listing the names (values stay secret — names only).`,
    });
  }
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  // Missing files are review findings in the score only when high (gitignore / env example).
  const scoreFindings: CodeFinding[] = [
    ...findings,
    ...missing
      .filter((m) => m.severity === "high")
      .map((m) => ({
        ruleId: "CR-MISS",
        severity: m.severity,
        confidenceBasis: "confirmed" as const,
        line: 0,
        title: `Missing ${m.path}`,
        evidence: m.why,
        recommendation: `Add ${m.path}.`,
      })),
  ];
  return {
    rootName: input.rootName,
    filesSeen: inventory.filesSeen,
    filesReviewed: input.files.length,
    filesSkipped: input.filesSkipped,
    totalLines,
    truncated,
    score: scoreCodeFindings(scoreFindings),
    findings,
    counts,
    missing,
    env,
    vercel: { present: inventory.hasVercel, note: inventory.vercelNote },
    note: thoroughNote(),
  };
}

export function thoroughToMarkdown(report: ThoroughReport): string {
  const lines: string[] = [
    `# Clyvro Code Review — ${report.rootName}`,
    "",
    `Walked ${report.filesSeen} paths · reviewed ${report.filesReviewed} files · ${report.totalLines} lines · score ${report.score}/100 · ` +
      `${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium, ${report.counts.low} low` +
      (report.truncated ? " · findings capped" : ""),
    "",
    `_${report.note}_`,
    "",
  ];
  if (report.missing.length) {
    lines.push("## Missing files", "");
    for (const m of report.missing) {
      lines.push(`- **${m.path}** (${m.severity}) — ${m.why}`);
    }
    lines.push("");
  } else {
    lines.push("## Missing files", "", "No obvious project files were missing.", "");
  }
  lines.push("## Environment names", "");
  lines.push(`Used in code: ${report.env.used.length ? report.env.used.map((u) => u.name).join(", ") : "(none detected)"}`);
  lines.push(`In .env.example: ${report.env.exampleKeys.length ? report.env.exampleKeys.join(", ") : "(none)"}`);
  if (report.env.missingFromExample.length) {
    lines.push(`Missing from .env.example: ${report.env.missingFromExample.join(", ")}`);
  }
  lines.push("", report.vercel.note, "");
  lines.push("## Findings", "");
  if (!report.findings.length) lines.push("No bugs matched in the reviewed files.", "");
  let current = "";
  for (const f of report.findings) {
    if (f.file !== current) { current = f.file; lines.push(`### ${f.file}`, ""); }
    lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} — ${f.evidence} Fix: ${f.recommendation}`);
  }
  return lines.join("\n");
}

export function thoroughToAgentPrompt(report: ThoroughReport): string {
  const lines: string[] = [
    `You are fixing findings from a Clyvro thorough Code Review of "${report.rootName}" (${report.filesReviewed} files, ${report.totalLines} lines, score ${report.score}/100).`,
    "",
    "Rules:",
    "1. Open each cited file + line and confirm the pattern in context before changing anything; if a finding is a false positive, say so instead of changing code blindly.",
    "2. Secrets flagged as hardcoded must be rotated, not just moved — assume they are compromised.",
    "3. Add missing files (README, LICENSE, CI, tests, .gitignore, .env.example) as real files, not comments.",
    "4. Do not invent Vercel env values. Names only. Live Vercel compare is a later Clyvro step.",
    "5. Work file by file; show diffs and wait for approval before committing.",
    "",
    "Missing files:",
  ];
  if (!report.missing.length) lines.push("- None.");
  else for (const m of report.missing) lines.push(`- ${m.path} (${m.severity}) — ${m.why}`);
  lines.push("", "Env names used in code but missing from .env.example:");
  if (!report.env.missingFromExample.length) lines.push("- None.");
  else for (const n of report.env.missingFromExample) lines.push(`- ${n}`);
  lines.push("", "Findings:");
  if (!report.findings.length) lines.push("- None. Confirm nothing regressed and summarise what you checked.");
  for (const f of report.findings) {
    lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.file} — ${f.title} — ${f.evidence} Fix: ${f.recommendation}`);
  }
  return lines.join("\n");
}
