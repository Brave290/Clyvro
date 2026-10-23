import { auditScore } from "@/lib/types";

/**
 * Code Reviewer — reads every line, detects the language, finds bugs,
 * and tells you what to fix. Pattern-based, line-evidence. Source is
 * analysed in memory and NEVER stored — only findings + stats are saved.
 * Not an AI (that ships later) and not a pentest.
 */

export type CodeLanguage =
  | "auto"
  | "javascript"
  | "typescript"
  | "python"
  | "php"
  | "go"
  | "ruby"
  | "java"
  | "rust"
  | "csharp"
  | "shell"
  | "sql"
  | "html"
  | "other";

export const CODE_LANGUAGES: { id: CodeLanguage; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
  { id: "ruby", label: "Ruby" },
  { id: "java", label: "Java" },
  { id: "rust", label: "Rust" },
  { id: "csharp", label: "C#" },
  { id: "shell", label: "Shell" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "other", label: "Other" },
];

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

const MAX_CHARS = 400_000;
/** Per-file / per-paste report cap. Every line is still read. */
export const MAX_FINDINGS = 200;

const EXT_LANGUAGE: Record<string, CodeLanguage> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", pyw: "python",
  php: "php", phtml: "php",
  go: "go",
  rb: "ruby",
  java: "java",
  rs: "rust",
  cs: "csharp",
  sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql",
  html: "html", htm: "html",
};

/** Detect language from a file path (extension / Dockerfile). */
export function languageFromPath(path: string): CodeLanguage {
  const base = path.split("/").pop() ?? "";
  if (/^Dockerfile/i.test(base)) return "shell";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXT_LANGUAGE[ext] ?? "other";
}

export function detectLanguage(code: string, hint: CodeLanguage = "auto", path?: string): string {
  if (hint !== "auto") return hint;
  if (path) {
    const fromPath = languageFromPath(path);
    if (fromPath !== "other") return fromPath;
  }
  if (/<\?php/.test(code)) return "php";
  if (/<\s*(html|div|span|script|body|head)\b/i.test(code) && /<\/\w+>/.test(code)) return "html";
  if (/^\s*(def |import |from \w+ import|print\()/m.test(code) && !/function |const |=>/.test(code)) return "python";
  if (/^\s*package \w+/m.test(code) && /func /.test(code)) return "go";
  if (/^\s*(require |class \w+|def \w+)/m.test(code) && /end\s*$/m.test(code)) return "ruby";
  if (/public\s+class\s+\w+/.test(code) && /System\.(out|err)/.test(code)) return "java";
  if (/fn \w+\s*\(/.test(code) && /let\s+mut\s+|println!/.test(code)) return "rust";
  if (/namespace \w+|using System/.test(code)) return "csharp";
  if (/^\s*(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/im.test(code) && !/function |const |=>/.test(code)) return "sql";
  if (/:\s*(string|number|boolean|any)\b|interface \w+ \{|import .* from/.test(code)) return "typescript";
  if (/function |const |let |=>|require\(|module\.exports/.test(code)) return "javascript";
  if (/^\s*(#!\/bin\/|echo |export )/.test(code)) return "shell";
  return "other";
}

interface Rule {
  id: string;
  severity: CodeFinding["severity"];
  basis: CodeFinding["confidenceBasis"];
  title: string;
  recommendation: string;
  /** If set, only run when the file's language is one of these. */
  langs?: string[];
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
    langs: ["javascript", "typescript", "python", "php", "ruby", "other"],
    test: (l) => /\beval\s*\(|new Function\s*\(|Kernel\.eval|instance_eval/.test(l),
  },
  {
    id: "CR-005", severity: "high", basis: "heuristic",
    title: "SQL built by string concatenation/interpolation",
    recommendation: "Use parameterised queries (prepared statements / placeholders) so values can never become SQL syntax: db.query('SELECT … WHERE id = ?', [id]).",
    test: (l) => /(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)/i.test(l) && (/\+/.test(l) || /\$\{/.test(l) || /%s|format\(/.test(l) || /f["']SELECT|f["']INSERT/i.test(l)),
  },
  {
    id: "CR-006", severity: "high", basis: "heuristic",
    title: "Shell command built from dynamic input",
    recommendation: "Avoid the shell: call the binary with an argument array (execFile/spawn with shell:false), and allowlist any user-influenced arguments.",
    test: (l) => /(exec|execSync|spawn|os\.system|shell_exec|popen|subprocess\.\w+|Runtime\.getRuntime\(\)\.exec)\s*\(/.test(l) && (/\$\{|\+|`/.test(l) || /shell\s*=\s*True/.test(l)),
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
    id: "CR-015", severity: "high", basis: "confirmed",
    title: "Timer / interval runs a string as code",
    recommendation: "Pass a function, not a string: setTimeout(() => { … }, n). A string is eval in disguise.",
    langs: ["javascript", "typescript"],
    test: (l) => /set(Timeout|Interval)\s*\(\s*["'`]/.test(l),
  },
  {
    id: "CR-021", severity: "high", basis: "confirmed",
    title: "PHP extract() on request data",
    recommendation: "Don't extract() request arrays — it overwrites variables in the current scope. Read $_GET/$_POST keys you need, then validate them.",
    langs: ["php"],
    test: (l) => /extract\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/.test(l),
  },
  {
    id: "CR-020", severity: "high", basis: "heuristic",
    title: "Request data printed without escaping",
    recommendation: "Escape for HTML (htmlspecialchars / a template engine) before echoing request values, or you have a cross-site scripting bug.",
    langs: ["php"],
    test: (l) => /(echo|print)\s+.*\$_(GET|POST|REQUEST|COOKIE)/.test(l),
  },
  {
    id: "CR-023", severity: "high", basis: "heuristic",
    title: "Java Runtime.exec / ProcessBuilder with concatenated input",
    recommendation: "Don't build a shell string. Use ProcessBuilder with a argument list and allowlist any user-influenced parts.",
    langs: ["java"],
    test: (l) => /(Runtime\.getRuntime\(\)\.exec|new ProcessBuilder)\s*\(/.test(l) && (/\+/.test(l) || /\$\{/.test(l)),
  },
  {
    id: "CR-033", severity: "high", basis: "confirmed",
    title: "World-writable permissions (0777 / chmod 777)",
    recommendation: "Use the tightest mode that still works (0644 files, 0755 dirs). 0777 lets any user on the machine change the file.",
    test: (l) => /chmod\s*\(\s*['\"]?0?777|chmod\s+777\b|mode\s*=\s*0o?777/.test(l),
  },
  {
    id: "CR-034", severity: "high", basis: "confirmed",
    title: "Pipe remote script into a shell (curl | sh)",
    recommendation: "Download the script, read it, then run a pinned version. Piping curl into sh runs whatever the server sends today.",
    langs: ["shell", "other"],
    test: (l) => /curl\s[^|\n]*\|\s*(ba)?sh\b|wget\s[^|\n]*\|\s*(ba)?sh\b/.test(l),
  },
  {
    id: "CR-019", severity: "high", basis: "confirmed",
    title: "Debug mode left on",
    recommendation: "Turn debug off in production (DEBUG=False, app.debug = False). Debug pages leak secrets, stack traces, and often an interactive console.",
    langs: ["python", "php", "javascript", "typescript", "other"],
    test: (l) => /\bDEBUG\s*=\s*True\b|app\.debug\s*=\s*True|debug\s*=\s*True\b/.test(l),
  },
  {
    id: "CR-004", severity: "medium", basis: "heuristic",
    title: "HTML injected via innerHTML / dangerouslySetInnerHTML / document.write",
    recommendation: "Render text as text (textContent / JSX expressions). If HTML must be rendered, sanitise it with DOMPurify first and treat the value as untrusted.",
    langs: ["javascript", "typescript", "html"],
    test: (l) => /dangerouslySetInnerHTML|innerHTML\s*=|document\.write\s*\(/.test(l),
  },
  {
    id: "CR-016", severity: "medium", basis: "heuristic",
    title: "Auth token written to localStorage / sessionStorage",
    recommendation: "Keep session tokens in an HttpOnly Secure cookie. localStorage is readable by any script on the page (XSS → stolen session).",
    langs: ["javascript", "typescript"],
    test: (l) => /(localStorage|sessionStorage)\.setItem\s*\(/.test(l) && /(token|session|jwt|password|secret|auth)/i.test(l),
  },
  {
    id: "CR-017", severity: "medium", basis: "heuristic",
    title: "target=_blank without rel=noopener",
    recommendation: "Add rel=\"noopener noreferrer\" on every target=\"_blank\" link. Without it the new page can reach window.opener and navigate your tab.",
    langs: ["javascript", "typescript", "html"],
    test: (l) => /target\s*=\s*['\"]_blank['\"]/.test(l) && !/noopener/.test(l),
  },
  {
    id: "CR-018", severity: "medium", basis: "confirmed",
    title: "Bare except: swallows every error",
    recommendation: "Catch the exceptions you expect (except ValueError as err). Bare except: hides bugs and can catch KeyboardInterrupt/SystemExit.",
    langs: ["python"],
    test: (l) => /^\s*except\s*:/.test(l),
  },
  {
    id: "CR-027", severity: "medium", basis: "heuristic",
    title: "Predictable random used for a security-sensitive value",
    recommendation: "Use a CSPRNG: secrets module (Python), crypto.randomUUID()/randomBytes (Node), random_bytes (PHP). random.random / Math.random are predictable.",
    test: (l) => (/(Math\.random\s*\(\s*\)|random\.(random|randint|choice)\s*\()/.test(l) && /(token|session|otp|code|secret|key|password|id\b)/i.test(l)),
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
    langs: ["javascript", "typescript"],
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
    id: "CR-031", severity: "medium", basis: "confirmed",
    title: "Hosts / CSRF protection disabled",
    recommendation: "Put real hostnames in ALLOWED_HOSTS. Don't csrf_exempt views that change data. These switches exist for local demos, not production.",
    langs: ["python", "javascript", "typescript", "other"],
    test: (l) => /ALLOWED_HOSTS\s*=\s*\[\s*["']\*["']\]|csrf_exempt|csrf\s*=\s*False/.test(l),
  },
  {
    id: "CR-024", severity: "low", basis: "heuristic",
    title: "Empty catch / except pass swallows the error",
    recommendation: "Log the error or re-raise. An empty catch hides failures until they show up as a worse bug later.",
    test: (l) => /catch\s*\([^)]*\)\s*\{\s*\}|except\s+\w+\s+as\s+\w+\s*:\s*pass\b|except\s+\w+\s*:\s*pass\b/.test(l),
  },
  {
    id: "CR-025", severity: "low", basis: "confirmed",
    title: "debugger / binding.pry leftover",
    recommendation: "Remove it before this ships. A leftover debugger pauses the process (or opens a console) for anyone who hits that line.",
    test: (l) => /(^|\s)debugger;?\s*$|binding\.pry|pdb\.set_trace\(\)|breakpoint\(\)/.test(l),
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

export function analyzeCode(raw: string, languageHint: CodeLanguage = "auto", path?: string): CodeReviewReport {
  const code = raw.slice(0, MAX_CHARS);
  const language = detectLanguage(code, languageHint, path);
  const lines = code.split("\n");
  const findings: CodeFinding[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (findings.length >= MAX_FINDINGS) break;
    const line = lines[i];
    const trimmed = line.trim();
    for (const rule of RULES) {
      if (rule.langs && !rule.langs.includes(language)) continue;
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
  }
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  const score = scoreCodeFindings(findings);
  const truncated = findings.length >= MAX_FINDINGS && lines.length > 0;
  return {
    language, lines: lines.length, score, findings, counts,
    note:
      `Read every line (${lines.length.toLocaleString()} in this ${language} file)` +
      (truncated ? `, reported the first ${MAX_FINDINGS} findings` : "") +
      " — detected the language, found bugs, and included the fix for each. " +
      "Source is analysed in memory and never stored.",
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
  if (!report.findings.length) lines.push("No bugs matched in this file.");
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
    `You are fixing findings from a Clyvro Code Review of "${title}" (${report.language}, ${report.lines} lines, score ${report.score}/100). Every finding quotes the line to change.`,
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
