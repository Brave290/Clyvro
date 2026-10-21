import { auditScore } from "@/lib/types";

/**
 * Code Reviewer v1 — deterministic, line-evidence static review.
 *
 * Honest scope: this is pattern-based static analysis, not an AI and
 * not a penetration test. Every finding quotes the exact line it
 * matched (line number + trimmed snippet), is labelled
 * confirmed/heuristic, and says how to fix it. The submitted source
 * is analysed in memory and NEVER stored — only findings + stats are
 * saved, so a review can be re-opened later without Clyvro keeping
 * anyone's code. Client-safe (types + analyzer + export builders).
 */

export type CodeLanguage = "auto" | "javascript" | "typescript" | "python" | "php" | "go" | "other";

export interface CodeFinding {
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low";
  confidenceBasis: "confirmed" | "heuristic";
  line: number;
  title: string;
  evidence: string;
  recommendation: string;
}

export interface CodeReviewReport {
  language: string;
  lines: number;
  score: number;
  findings: CodeFinding[];
  counts: { critical: number; high: number; medium: number; low: number };
  note: string;
}

const MAX_CHARS = 200_000;
const MAX_FINDINGS = 50;

export function detectLanguage(code: string, hint: CodeLanguage): string {
  if (hint !== "auto") return hint;
  if (/<\?php/.test(code)) return "php";
  if (/^\s*(def |import |from \w+ import|print\()/m.test(code) && !/function |const |=>/.test(code)) return "python";
  if (/^\s*package \w+/m.test(code) && /func /.test(code)) return "go";
  if (/:\s*(string|number|boolean|any)\b|interface \w+ \{|import .* from/.test(code)) return "typescript";
  if (/function |const |let |=>|require\(|module\.exports/.test(code)) return "javascript";
  return "other";
}

interface Rule {
  id: string;
  severity: CodeFinding["severity"];
  basis: CodeFinding["confidenceBasis"];
  title: string;
  recommendation: string;
  test: (line: string) => boolean;
}

const PLACEHOLDER = /example|placeholder|changeme|change-me|your[-_ ]|xxx+|\.\.\.|<[^>]+>/i;

const RULES: Rule[] = [
  {
    id: "CR-002", severity: "critical", basis: "confirmed",
    title: "Private key material in source code",
    recommendation: "Remove the key from source NOW, rotate/revoke it (assume it is compromised — it may already be in git history), and load keys from environment/secret storage.",
    test: (l) => /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(l),
  },
  {
    id: "CR-001", severity: "high", basis: "confirmed",
    title: "Hardcoded credential or API secret",
    recommendation: "Move this to an environment variable or secret manager and rotate the exposed value — anything committed should be treated as leaked.",
    test: (l) => {
      const m = l.match(/(api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i);
      return !!m && !PLACEHOLDER.test(m[2]);
    },
  },
  {
    id: "CR-003", severity: "high", basis: "confirmed",
    title: "Dynamic code execution (eval / Function constructor)",
    recommendation: "Remove eval-style execution. Parse data with JSON.parse or a real parser; if dynamic behaviour is truly needed, use an allowlist of named operations.",
    test: (l) => /\beval\s*\(|new Function\s*\(/.test(l),
  },
  {
    id: "CR-005", severity: "high", basis: "heuristic",
    title: "SQL built by string concatenation/interpolation",
    recommendation: "Use parameterised queries (prepared statements / placeholders) so values can never become SQL syntax: db.query('SELECT … WHERE id = ?', [id]).",
    test: (l) => /(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)/i.test(l) && (/\+/.test(l) || /\$\{/.test(l) || /%s|format\(/.test(l)),
  },
  {
    id: "CR-006", severity: "high", basis: "heuristic",
    title: "Shell command built from dynamic input",
    recommendation: "Avoid the shell: call the binary with an argument array (execFile/spawn with shell:false), and allowlist any user-influenced arguments.",
    test: (l) => /(exec|execSync|spawn|os\.system|shell_exec|popen|subprocess\.\w+)\s*\(/.test(l) && (/\$\{|\+|`/.test(l) || /shell\s*=\s*True/.test(l)),
  },
  {
    id: "CR-007", severity: "high", basis: "confirmed",
    title: "TLS certificate verification disabled",
    recommendation: "Re-enable verification and fix the underlying certificate problem. Disabled verification silently allows man-in-the-middle interception.",
    test: (l) => /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|InsecureSkipVerify\s*:\s*true/.test(l),
  },
  {
    id: "CR-008", severity: "high", basis: "heuristic",
    title: "Unsafe deserialization of untrusted data",
    recommendation: "Never unpickle/unserialize attacker-influenced data. Use JSON or a schema-validated format; in PHP prefer json_decode, in Python json/pydantic.",
    test: (l) => /pickle\.loads?\s*\(|yaml\.load\s*\((?!.*SafeLoader)|unserialize\s*\(|ObjectInputStream/.test(l),
  },
  {
    id: "CR-004", severity: "medium", basis: "heuristic",
    title: "HTML injected via innerHTML / dangerouslySetInnerHTML / document.write",
    recommendation: "Render text as text (textContent / JSX expressions). If HTML must be rendered, sanitise it with DOMPurify first and treat the value as untrusted.",
    test: (l) => /dangerouslySetInnerHTML|innerHTML\s*=|document\.write\s*\(/.test(l),
  },
  {
    id: "CR-009", severity: "medium", basis: "heuristic",
    title: "Weak hash (MD5/SHA-1) near credential handling",
    recommendation: "Hash passwords with bcrypt/argon2 (never MD5/SHA-1). For integrity checks use SHA-256+.",
    test: (l) => /(md5|sha1)\s*\(/i.test(l) && /(pass|pwd|secret|token|auth)/i.test(l),
  },
  {
    id: "CR-010", severity: "medium", basis: "heuristic",
    title: "Math.random used for a security-sensitive value",
    recommendation: "Use a CSPRNG: crypto.randomUUID()/randomBytes (Node), secrets module (Python), random_bytes (PHP). Math.random is predictable.",
    test: (l) => /Math\.random\s*\(\s*\)/.test(l) && /(token|session|otp|code|secret|key|password|id\b)/i.test(l),
  },
  {
    id: "CR-013", severity: "medium", basis: "confirmed",
    title: "CORS allows any origin (*)",
    recommendation: "Allowlist the exact origins that need access. Wildcard CORS combined with credentials exposes authenticated APIs to any website.",
    test: (l) => /Access-Control-Allow-Origin["']?\s*[:=,]\s*["']\*["']|origin\s*:\s*["']\*["']|allow_origins\s*=\s*\[?\s*["']\*["']/.test(l),
  },
  {
    id: "CR-014", severity: "medium", basis: "heuristic",
    title: "JWT decoded without verification",
    recommendation: "Always verify the signature and expiry server-side (jwt.verify with your secret/keys). Decoding alone trusts whatever the sender claims.",
    test: (l) => /jwt\.decode\s*\(|decode\([^)]*verify\s*=\s*False/.test(l),
  },
  {
    id: "CR-011", severity: "low", basis: "confirmed",
    title: "Plain-HTTP URL in code",
    recommendation: "Switch to https:// — plain HTTP leaks the request and can be modified in transit. (Localhost is exempt.)",
    test: (l) => /http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org|schemas\.)[^\s"'`]+/.test(l),
  },
  {
    id: "CR-012", severity: "low", basis: "confirmed",
    title: "Leftover TODO/FIXME/HACK marker",
    recommendation: "Resolve it or convert it into a tracked ticket. Markers near auth/payment code deserve a second look before launch.",
    test: (l) => /(^|\s)(TODO|FIXME|HACK|XXX)[:\s]/.test(l),
  },
];

/** Score a set of code findings with the same severity math used across Clyvro. */
export function scoreCodeFindings(findings: CodeFinding[]): number {
  return auditScore(findings.map((f) => ({
    ruleId: f.ruleId, ruleVersion: "1.0", page: "", category: "Reliability" as const,
    severity: f.severity, confidenceBasis: f.confidenceBasis,
    title: f.title, explanation: "", evidence: [f.evidence], recommendation: f.recommendation, effort: "Hours" as const, impactRationale: "",
  })));
}

export function analyzeCode(raw: string, languageHint: CodeLanguage = "auto"): CodeReviewReport {
  const code = raw.slice(0, MAX_CHARS);
  const language = detectLanguage(code, languageHint);
  const lines = code.split("\n");
  const findings: CodeFinding[] = [];
  lines.forEach((line, i) => {
    if (findings.length >= MAX_FINDINGS) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") && !/TODO|FIXME/.test(trimmed)) {
      // still check comments for secrets/TODOs below via rules that target them
    }
    for (const rule of RULES) {
      try {
        if (rule.test(line)) {
          findings.push({
            ruleId: rule.id, severity: rule.severity, confidenceBasis: rule.basis,
            line: i + 1, title: rule.title,
            evidence: `Line ${i + 1}: ${trimmed.slice(0, 160)}`,
            recommendation: rule.recommendation,
          });
          break; // one finding per line keeps the report readable
        }
      } catch { /* a rule must never break the review */ }
    }
  });
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  const score = scoreCodeFindings(findings);
  return {
    language, lines: lines.length, score, findings, counts,
    note: "Pattern-based static review of the pasted code only — it doesn't run the code, follow data flow, or audit dependencies. A clean result means no known-bad patterns were matched, not that the code is secure.",
  };
}

export function codeReviewToMarkdown(title: string, report: CodeReviewReport): string {
  const lines: string[] = [
    `# Code review — ${title}`,
    "",
    `Language: ${report.language} · ${report.lines} lines · Score ${report.score}/100 · ` +
      `${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium, ${report.counts.low} low`,
    "",
    `_${report.note}_`,
    "",
  ];
  if (!report.findings.length) lines.push("No known-bad patterns matched in this code.");
  for (const f of report.findings) {
    lines.push(`## [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title}`);
    lines.push(`Evidence: ${f.evidence}`);
    lines.push(`Fix: ${f.recommendation}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function codeReviewToAgentPrompt(title: string, report: CodeReviewReport): string {
  const lines: string[] = [
    `You are fixing findings from a Clyvro Code Review of "${title}" (${report.language}, ${report.lines} lines, score ${report.score}/100). Pattern-based evidence is quoted per line.`,
    "",
    "Rules:",
    "1. Open each cited line and confirm the pattern in context before changing anything; if a finding is a false positive in context, say so with the reason instead of changing code blindly.",
    "2. Secrets flagged as hardcoded must be rotated, not just moved — assume they are compromised.",
    "3. Show diffs and wait for my approval before committing.",
    "",
    "Findings:",
  ];
  if (!report.findings.length) lines.push("- None. Confirm nothing regressed and summarise what you checked.");
  for (const f of report.findings) lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} — ${f.evidence} Fix: ${f.recommendation}`);
  return lines.join("\n");
}
