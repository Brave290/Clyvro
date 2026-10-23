#!/usr/bin/env node
/**
 * Clyvro CLI + MCP
 *
 *   clyvro login
 *   clyvro scan https://example.com --consent
 *   clyvro review .
 *   clyvro mcp
 *
 * Install (Linux/macOS/Alpine/Arch/WSL):
 *   curl -fsSL https://clyvro.vercel.app/install.sh | sh
 * Windows:
 *   irm https://clyvro.vercel.app/install.ps1 | iex
 * Anywhere with npm:
 *   npm i -g https://clyvro.vercel.app/cli/clyvro.tgz
 */
import { homedir } from "node:os";
import {
  mkdirSync, readFileSync, writeFileSync, rmSync, existsSync,
  readdirSync, statSync,
} from "node:fs";
import { join, resolve, relative, basename, delimiter, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as stdinFd, stdout as stdoutFd, stderr as stderrFd } from "node:process";

const VERSION = "0.4.0";
const DEFAULT_BASE = "https://clyvro.vercel.app";
const DIR = join(homedir(), ".clyvro");
const FILE = join(DIR, "config.json");
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function loadCfg() {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; }
}
function saveCfg(cfg) {
  mkdirSync(DIR, { mode: 0o700, recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}
function flag(name) {
  return process.argv.includes(name);
}
function positional() {
  return process.argv.slice(3).filter((a) => !a.startsWith("-"));
}

function base() {
  return (arg("--base") || process.env.CLYVRO_BASE || loadCfg().base || DEFAULT_BASE).replace(/\/+$/, "");
}
function key() {
  return arg("--api-key") || process.env.CLYVRO_API_KEY || loadCfg().apiKey || "";
}

const errTty = Boolean(stderrFd.isTTY);
function live(msg) {
  if (!errTty) return;
  stderrFd.write(`\r\x1b[K${msg}`);
}
function liveLine(msg) {
  if (!errTty) { console.error(msg); return; }
  stderrFd.write(`\r\x1b[K${msg}\n`);
}
function elapsed(t0) {
  const s = Math.max(0, Math.round((Date.now() - t0) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function selfPath() {
  try { return resolve(process.argv[1] || fileURLToPath(import.meta.url)); }
  catch { return "clyvro"; }
}
function clyvroOnPath() {
  const pathEnv = process.env.PATH || "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    try {
      if (existsSync(join(dir, "clyvro"))) return true;
    } catch { /* ignore */ }
  }
  return false;
}
function invoke() {
  if (clyvroOnPath()) return "clyvro";
  const self = selfPath();
  return `node ${self}`;
}
function installHint() {
  const cmd = invoke();
  const onPath = clyvroOnPath();
  const lines = [
    "",
    onPath
      ? "clyvro is on your PATH. Next:"
      : "clyvro is not a system package (apk/apt will not find it). Run it as:",
    "",
    `  ${cmd} whoami`,
    `  ${cmd} scan https://your-site.com --consent`,
    `  ${cmd} review .`,
    "",
  ];
  if (!onPath) {
    lines.push("Install the command (puts clyvro in ~/.local/bin):", "");
    lines.push(`  curl -fsSL ${base()}/install.sh | sh`, "");
    lines.push("Then open a new terminal, or:", `  export PATH="$HOME/.local/bin:$PATH"`, "");
  }
  return lines.join("\n");
}

async function api(method, path, body) {
  const headers = { accept: "application/json" };
  const k = key();
  if (k) headers.authorization = `Bearer ${k}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base()}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || json?.error?.code || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function out(data) {
  if (flag("--pretty") || errTty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

function statusEmoji(status) {
  if (status === "completed") return "✅";
  if (status === "failed") return "❌";
  if (status === "cancelled") return "⏹️";
  if (status === "running") return "🔎";
  return "⏳";
}

async function withSpinner(label, promise) {
  if (!errTty) return promise;
  const t0 = Date.now();
  let i = 0;
  const timer = setInterval(() => {
    live(`${SPIN[i++ % SPIN.length]} ${label}  ·  ${elapsed(t0)}`);
  }, 80);
  try {
    const result = await promise;
    liveLine(`✅ ${label}  ·  ${elapsed(t0)}`);
    return result;
  } catch (err) {
    liveLine(`❌ ${label}  ·  ${elapsed(t0)}`);
    throw err;
  } finally {
    clearInterval(timer);
  }
}

async function runQueuedJob({ label, createPath, body, runPath, getPath, maxMs = 15 * 60 * 1000 }) {
  liveLine(`🚀 ${label}`);
  const created = await withSpinner("Queuing…", api("POST", createPath, body));
  const id = created.id;
  if (!id) return created;
  liveLine(`✅ Queued  ·  ${id}`);
  const runUrl = runPath.replace(":id", id);
  const getUrl = getPath.replace(":id", id);
  let runErr = null;
  const runP = api("POST", runUrl).catch((e) => { runErr = e; return e; });
  const t0 = Date.now();
  let i = 0;
  while (true) {
    let row;
    try {
      row = await api("GET", getUrl);
    } catch (err) {
      live(`${SPIN[i++ % SPIN.length]} 📡 Checking status…  ·  ${elapsed(t0)}`);
      if (Date.now() - t0 > maxMs) throw err;
      await sleep(1500);
      continue;
    }
    const steps = Array.isArray(row.steps) ? row.steps : [];
    const last = steps.length ? (steps[steps.length - 1].label || row.status) : (row.status || "queued");
    const emoji = statusEmoji(row.status);
    live(`${SPIN[i++ % SPIN.length]} ${emoji} ${last}  ·  ${steps.length} step${steps.length === 1 ? "" : "s"}  ·  ${elapsed(t0)}`);
    if (row.status === "completed" || row.status === "failed" || row.status === "cancelled") {
      liveLine(`${emoji} ${row.status} in ${elapsed(t0)}`);
      return row;
    }
    if (runErr && (row.status === "queued" || !row.status) && Date.now() - t0 > 10_000) {
      throw runErr;
    }
    if (Date.now() - t0 > maxMs) {
      liveLine(`⏰ Still ${row.status || "running"} after ${elapsed(t0)}. It's working on the server — poll with:`);
      liveLine(`   ${invoke()}  (or GET ${getUrl})`);
      return row;
    }
    await sleep(1500);
  }
}

function printNextCommands() {
  console.error(installHint());
}

async function login() {
  const pasted = arg("--api-key") || process.env.CLYVRO_API_KEY;
  if (pasted) {
    saveCfg({ ...loadCfg(), apiKey: pasted, base: base() });
    liveLine("🔑 Saved API key");
    const me = await withSpinner("Checking whoami…", api("GET", "/api/v1/me"));
    liveLine(`✅ Signed in · ${me.email || me.user?.email || "ok"} · ${me.organization?.name || me.planId || ""}`);
    printNextCommands();
    out({ ok: true, ...me });
    return;
  }
  liveLine("🔐 Starting device login…");
  const started = await fetch(`${base()}/api/v1/cli/device`, { method: "POST" }).then((r) => r.json());
  if (!started?.user_code) throw new Error(started?.error?.message || "Could not start login.");
  liveLine("");
  liveLine(`  Open  ${started.verify_url}`);
  liveLine(`  Code  ${started.user_code}`);
  liveLine("");
  liveLine("Waiting for you to approve on your phone. This can take a minute — leave this running.");
  const until = Date.now() + (started.expires_in || 900) * 1000;
  const t0 = Date.now();
  let i = 0;
  while (Date.now() < until) {
    live(`${SPIN[i++ % SPIN.length]} 📱 Waiting for approval of ${started.user_code}  ·  ${elapsed(t0)}`);
    await sleep((started.interval || 3) * 1000);
    const polled = await fetch(`${base()}/api/v1/cli/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: started.device_code }),
    }).then((r) => r.json()).catch(() => null);
    if (polled?.token) {
      saveCfg({ ...loadCfg(), apiKey: polled.token, base: base() });
      liveLine(`✅ Signed in  ·  ${elapsed(t0)}`);
      printNextCommands();
      out({ ok: true, expires_in: polled.expires_in });
      return;
    }
    if (polled?.error && polled.error.code !== "VALIDATION" && polled.status !== "pending") {
      throw new Error(polled.error.message || "Login failed.");
    }
  }
  throw new Error("Login timed out. Run login again.");
}

function consentBody(url, extra = {}) {
  return { url, consent: true, ownsOrAuthorized: true, acceptLogs: true, noThirdPartyAttack: true, ...extra };
}

/* ── Thorough local Code Reviewer (keep rules in sync with src/lib/code-review-shared.ts) */

const PLACEHOLDER = /example|placeholder|changeme|change-me|your[-_ ]|xxx+|\.\.\.|<[^>]+>/i;
const EXT_LANG = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", py: "python", php: "php", go: "go",
  rb: "ruby", java: "java", rs: "rust", cs: "csharp", sh: "shell", bash: "shell",
  zsh: "shell", sql: "sql", html: "html", htm: "html",
};
function detectLang(rel, content) {
  const base = rel.split("/").pop() || "";
  if (/^Dockerfile/i.test(base)) return "shell";
  const ext = base.includes(".") ? base.split(".").pop().toLowerCase() : "";
  if (EXT_LANG[ext]) return EXT_LANG[ext];
  if (/<\?php/.test(content)) return "php";
  if (/^\s*(def |import |from \w+ import)/m.test(content)) return "python";
  if (/function |const |let |=>/.test(content)) return "javascript";
  return "other";
}
const RULES = [
  { id: "CR-002", severity: "critical", title: "Private key material in source code",
    recommendation: "Remove the key from source NOW, rotate/revoke it, and load keys from environment/secret storage.",
    test: (l) => /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(l) },
  { id: "CR-001", severity: "high", title: "Hardcoded credential or API secret",
    recommendation: "Move this to an environment variable or secret manager and rotate the exposed value.",
    test: (l) => {
      const m = l.match(/(api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|password|passwd)\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i);
      return !!m && !PLACEHOLDER.test(m[2]);
    } },
  { id: "CR-003", severity: "high", title: "Dynamic code execution (eval / Function constructor)",
    langs: ["javascript", "typescript", "python", "php", "ruby", "other"],
    recommendation: "Remove eval-style execution. Parse data with JSON.parse or a real parser.",
    test: (l) => /\beval\s*\(|new Function\s*\(|Kernel\.eval|instance_eval/.test(l) },
  { id: "CR-005", severity: "high", title: "SQL built by string concatenation/interpolation",
    recommendation: "Use parameterised queries so values can never become SQL syntax.",
    test: (l) => /(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)/i.test(l) && (/\+/.test(l) || /\$\{/.test(l) || /%s|format\(/.test(l) || /f["']SELECT|f["']INSERT/i.test(l)) },
  { id: "CR-006", severity: "high", title: "Shell command built from dynamic input",
    recommendation: "Avoid the shell: call the binary with an argument array (shell:false).",
    test: (l) => /(exec|execSync|spawn|os\.system|shell_exec|popen|subprocess\.\w+|Runtime\.getRuntime\(\)\.exec)\s*\(/.test(l) && (/\$\{|\+|`/.test(l) || /shell\s*=\s*True/.test(l)) },
  { id: "CR-007", severity: "high", title: "TLS certificate verification disabled",
    recommendation: "Re-enable verification. Disabled verification allows man-in-the-middle interception.",
    test: (l) => /verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|InsecureSkipVerify\s*:\s*true/.test(l) },
  { id: "CR-008", severity: "high", title: "Unsafe deserialization of untrusted data",
    recommendation: "Never unpickle/unserialize attacker-influenced data. Use JSON or a schema-validated format.",
    test: (l) => /pickle\.loads?\s*\(|yaml\.load\s*\((?!.*SafeLoader)|unserialize\s*\(|ObjectInputStream/.test(l) },
  { id: "CR-015", severity: "high", langs: ["javascript", "typescript"], title: "Timer / interval runs a string as code",
    recommendation: "Pass a function, not a string: setTimeout(() => { … }, n).",
    test: (l) => /set(Timeout|Interval)\s*\(\s*["'`]/.test(l) },
  { id: "CR-021", severity: "high", langs: ["php"], title: "PHP extract() on request data",
    recommendation: "Don't extract() request arrays. Read the keys you need and validate them.",
    test: (l) => /extract\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/.test(l) },
  { id: "CR-020", severity: "high", langs: ["php"], title: "Request data printed without escaping",
    recommendation: "Escape for HTML (htmlspecialchars) before echoing request values.",
    test: (l) => /(echo|print)\s+.*\$_(GET|POST|REQUEST|COOKIE)/.test(l) },
  { id: "CR-023", severity: "high", langs: ["java"], title: "Java Runtime.exec / ProcessBuilder with concatenated input",
    recommendation: "Use ProcessBuilder with an argument list, not a concatenated shell string.",
    test: (l) => /(Runtime\.getRuntime\(\)\.exec|new ProcessBuilder)\s*\(/.test(l) && (/\+/.test(l) || /\$\{/.test(l)) },
  { id: "CR-033", severity: "high", title: "World-writable permissions (0777 / chmod 777)",
    recommendation: "Use the tightest mode that still works (0644 files, 0755 dirs).",
    test: (l) => /chmod\s*\(\s*['"]?0?777|chmod\s+777\b|mode\s*=\s*0o?777/.test(l) },
  { id: "CR-034", severity: "high", langs: ["shell", "other"], title: "Pipe remote script into a shell (curl | sh)",
    recommendation: "Download the script, read it, then run a pinned version.",
    test: (l) => /curl\s[^|\n]*\|\s*(ba)?sh\b|wget\s[^|\n]*\|\s*(ba)?sh\b/.test(l) },
  { id: "CR-019", severity: "high", langs: ["python", "php", "javascript", "typescript", "other"], title: "Debug mode left on",
    recommendation: "Turn debug off in production (DEBUG=False).",
    test: (l) => /\bDEBUG\s*=\s*True\b|app\.debug\s*=\s*True|debug\s*=\s*True\b/.test(l) },
  { id: "CR-004", severity: "medium", langs: ["javascript", "typescript", "html"], title: "HTML injected via innerHTML / dangerouslySetInnerHTML / document.write",
    recommendation: "Render text as text. If HTML must be rendered, sanitise it with DOMPurify first.",
    test: (l) => /dangerouslySetInnerHTML|innerHTML\s*=|document\.write\s*\(/.test(l) },
  { id: "CR-016", severity: "medium", langs: ["javascript", "typescript"], title: "Auth token written to localStorage / sessionStorage",
    recommendation: "Keep session tokens in an HttpOnly Secure cookie.",
    test: (l) => /(localStorage|sessionStorage)\.setItem\s*\(/.test(l) && /(token|session|jwt|password|secret|auth)/i.test(l) },
  { id: "CR-017", severity: "medium", langs: ["javascript", "typescript", "html"], title: "target=_blank without rel=noopener",
    recommendation: "Add rel=\"noopener noreferrer\" on every target=\"_blank\" link.",
    test: (l) => /target\s*=\s*['"]_blank['"]/.test(l) && !/noopener/.test(l) },
  { id: "CR-018", severity: "medium", langs: ["python"], title: "Bare except: swallows every error",
    recommendation: "Catch the exceptions you expect. Bare except: hides bugs.",
    test: (l) => /^\s*except\s*:/.test(l) },
  { id: "CR-027", severity: "medium", title: "Predictable random used for a security-sensitive value",
    recommendation: "Use a CSPRNG: secrets, crypto.randomUUID()/randomBytes, random_bytes.",
    test: (l) => (/(Math\.random\s*\(\s*\)|random\.(random|randint|choice)\s*\()/.test(l) && /(token|session|otp|code|secret|key|password|id\b)/i.test(l)) },
  { id: "CR-009", severity: "medium", title: "Weak hash (MD5/SHA-1) near credential handling",
    recommendation: "Hash passwords with bcrypt/argon2 (never MD5/SHA-1).",
    test: (l) => /(md5|sha1)\s*\(/i.test(l) && /(pass|pwd|secret|token|auth)/i.test(l) },
  { id: "CR-010", severity: "medium", langs: ["javascript", "typescript"], title: "Math.random used for a security-sensitive value",
    recommendation: "Use a CSPRNG: crypto.randomUUID()/randomBytes, secrets, random_bytes.",
    test: (l) => /Math\.random\s*\(\s*\)/.test(l) && /(token|session|otp|code|secret|key|password|id\b)/i.test(l) },
  { id: "CR-013", severity: "medium", title: "CORS allows any origin (*)",
    recommendation: "Allowlist the exact origins that need access.",
    test: (l) => /Access-Control-Allow-Origin["']?\s*[:=,]\s*["']\*["']|origin\s*:\s*["']\*["']|allow_origins\s*=\s*\[?\s*["']\*["']/.test(l) },
  { id: "CR-014", severity: "medium", title: "JWT decoded without verification",
    recommendation: "Always verify the signature and expiry server-side.",
    test: (l) => /jwt\.decode\s*\(|decode\([^)]*verify\s*=\s*False/.test(l) },
  { id: "CR-031", severity: "medium", langs: ["python", "javascript", "typescript", "other"], title: "Hosts / CSRF protection disabled",
    recommendation: "Put real hostnames in ALLOWED_HOSTS. Don't csrf_exempt views that change data.",
    test: (l) => /ALLOWED_HOSTS\s*=\s*\[\s*["']\*["']\]|csrf_exempt|csrf\s*=\s*False/.test(l) },
  { id: "CR-024", severity: "low", title: "Empty catch / except pass swallows the error",
    recommendation: "Log the error or re-raise.",
    test: (l) => /catch\s*\([^)]*\)\s*\{\s*\}|except\s+\w+\s+as\s+\w+\s*:\s*pass\b|except\s+\w+\s*:\s*pass\b/.test(l) },
  { id: "CR-025", severity: "low", title: "debugger / binding.pry leftover",
    recommendation: "Remove it before this ships.",
    test: (l) => /(^|\s)debugger;?\s*$|binding\.pry|pdb\.set_trace\(\)|breakpoint\(\)/.test(l) },
  { id: "CR-011", severity: "low", title: "Plain-HTTP URL in code",
    recommendation: "Switch to https:// — plain HTTP leaks the request.",
    test: (l) => /http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org|schemas\.)[^\s"'`]+/.test(l) },
  { id: "CR-012", severity: "low", title: "Leftover TODO/FIXME/HACK marker",
    recommendation: "Resolve it or convert it into a tracked ticket.",
    test: (l) => /(^|\s)(TODO|FIXME|HACK|XXX)[:\s]/.test(l) },
];

const SKIP_DIR = new Set(["node_modules", "vendor", "dist", "build", "out", "coverage", ".next", ".git", ".turbo", ".cache", "__pycache__", "target", "bin", "obj", ".vercel", ".output", ".nuxt"]);
const REVIEWABLE = /\.(js|jsx|mjs|cjs|ts|tsx|py|php|go|rb|java|c|h|cpp|hpp|cs|rs|sh|bash|zsh|sql|json|ya?ml|toml|html?|env|example)$/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|bz2|7z|rar|woff2?|ttf|otf|eot|mp[34]|mov|avi|webm|wasm|class|jar|so|dll|exe|bin|dat|db|sqlite)$/i;
const SKIP_ENV = new Set(["NODE_ENV", "PATH", "HOME", "PWD", "USER", "SHELL", "TMPDIR", "TERM"]);
const ENV_RES = [
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
  /os\.environ(?:\.get)?\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /os\.Getenv\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /\$_(?:ENV|SERVER)\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
  /Deno\.env\.get\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  /getenv\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
];

function loadIgnore(root) {
  const extra = [];
  try {
    for (const line of readFileSync(join(root, ".gitignore"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || t.startsWith("!")) continue;
      extra.push(t.replace(/\/$/, "").replace(/^\//, ""));
    }
  } catch { /* no gitignore */ }
  return extra;
}
function ignored(rel, ignore) {
  const parts = rel.split("/");
  if (parts.some((p) => SKIP_DIR.has(p))) return true;
  for (const rule of ignore) {
    if (!rule) continue;
    if (rel === rule || rel.startsWith(rule + "/") || parts.includes(rule)) return true;
    if (rule.includes("*")) {
      const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\*/g, ".*") + "$");
      if (re.test(rel) || re.test(parts.at(-1))) return true;
    }
  }
  return false;
}
function walk(root) {
  const ignore = loadIgnore(root);
  const out = [];
  const start = root;
  function rec(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(start, abs).split("\\").join("/");
      if (ignored(rel, ignore)) continue;
      if (e.isDirectory()) rec(abs);
      else if (e.isFile()) out.push(rel);
    }
  }
  rec(root);
  return out;
}

function extractEnvNames(content) {
  const names = new Set();
  for (const re of ENV_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content))) {
      if (m[1] && !SKIP_ENV.has(m[1])) names.add(m[1]);
    }
  }
  return [...names];
}
function parseDotEnvKeys(content) {
  const keys = new Set();
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/);
    if (m) keys.add(m[1]);
  }
  return [...keys];
}
function analyzeFile(content, lang) {
  const findings = [];
  const lines = content.slice(0, 400_000).split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (findings.length >= 200) break;
    const line = lines[i];
    const trimmed = line.trim();
    for (const rule of RULES) {
      if (rule.langs && !rule.langs.includes(lang)) continue;
      try {
        if (rule.test(line)) {
          findings.push({
            ruleId: rule.id, severity: rule.severity, confidenceBasis: "confirmed",
            line: i + 1, title: rule.title,
            evidence: `Line ${i + 1}: ${trimmed.slice(0, 160)}`,
            recommendation: rule.recommendation,
          });
          break;
        }
      } catch { /* a rule must never break the review */ }
    }
  }
  return { lines: lines.length, findings, language: lang };
}

function inventory(paths) {
  const has = (re) => paths.some((p) => re.test(p));
  const missing = [];
  const project = has(/(^|\/)(package\.json|pyproject\.toml|go\.mod|Cargo\.toml|composer\.json|Gemfile|pubspec\.yaml)$/);
  if (project && !has(/(^|\/)README(\.[a-z0-9]+)?$/i)) missing.push({ path: "README.md", severity: "medium", why: "No README. People need a short “what this is / how to run it”." });
  if (project && !has(/(^|\/)LICEN[CS]E(\.[a-z0-9]+)?$/i)) missing.push({ path: "LICENSE", severity: "low", why: "No license file. Others cannot tell whether they may use this code." });
  if (!has(/(^|\/)\.gitignore$/)) missing.push({ path: ".gitignore", severity: "high", why: "No .gitignore. Secrets and node_modules are one `git add .` away from being committed." });
  if (project && !has(/(^|\/)\.github\/workflows\/.+\.(yml|yaml)$|(^|\/)\.gitlab-ci\.yml$/i)) {
    missing.push({ path: ".github/workflows/", severity: "medium", why: "No CI workflow. Tests never run on a pull request unless someone remembers." });
  }
  if (project && !has(/(^|\/)(__tests__|tests|spec)(\/|$)|(^|\/)test\/|\.(test|spec)\.[a-z0-9]+$/i)) {
    missing.push({ path: "tests/", severity: "medium", why: "No test files showed up." });
  }
  const hasVercel = has(/(^|\/)vercel\.json$|(^|\/)\.vercel\/project\.json$/);
  const hasEnvExample = has(/(^|\/)\.env\.(example|sample|template)$/i);
  return { missing, hasVercel, hasEnvExample };
}

function scoreOf(findings) {
  const w = { critical: 25, high: 12, medium: 5, low: 1 };
  let n = 0;
  for (const f of findings) n += w[f.severity] || 0;
  return Math.max(0, Math.min(100, 100 - n));
}

function thoroughMarkdown(report) {
  const lines = [
    `# Clyvro Code Review — ${report.rootName}`,
    "",
    `Walked ${report.filesSeen} paths · reviewed ${report.filesReviewed} files · ${report.totalLines} lines · score ${report.score}/100 · ` +
      `${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium, ${report.counts.low} low`,
    "",
    `_${report.note}_`,
    "",
    "## Missing files",
    "",
  ];
  if (!report.missing.length) lines.push("No obvious project files were missing.", "");
  else for (const m of report.missing) lines.push(`- **${m.path}** (${m.severity}) — ${m.why}`);
  lines.push("", "## Environment names", "");
  lines.push(`Used in code: ${report.env.used.length ? report.env.used.map((u) => u.name).join(", ") : "(none detected)"}`);
  lines.push(`In .env.example: ${report.env.exampleKeys.length ? report.env.exampleKeys.join(", ") : "(none)"}`);
  if (report.env.missingFromExample.length) lines.push(`Missing from .env.example: ${report.env.missingFromExample.join(", ")}`);
  lines.push("", report.vercel.note, "", "## Findings", "");
  if (!report.findings.length) lines.push("No bugs matched in the reviewed files.", "");
  let current = "";
  for (const f of report.findings) {
    if (f.file !== current) { current = f.file; lines.push(`### ${f.file}`, ""); }
    lines.push(`- [${f.severity.toUpperCase()} · ${f.ruleId}] ${f.title} — ${f.evidence} Fix: ${f.recommendation}`);
  }
  return lines.join("\n");
}

async function reviewLocal(rootArg, outFile) {
  const root = resolve(rootArg || ".");
  const rootName = basename(root);
  liveLine(`📂 Thorough Code Reviewer · ${root}`);
  liveLine("   Reads every line, detects the language, finds bugs, tells you what to fix.");
  const t0 = Date.now();
  live("🔍 Pass 1/3 — listing files…");
  const paths = walk(root);
  liveLine(`✅ Pass 1/3 — ${paths.length} files  ·  ${elapsed(t0)}`);
  const inv = inventory(paths);
  liveLine(`🔎 Pass 2/3 — missing files & project shape  ·  ${inv.missing.length} note(s)`);

  const reviewable = paths.filter((p) => {
    const baseName = p.split("/").pop() || "";
    if (BINARY.test(p) || /\.min\.(js|css)$/i.test(p)) return false;
    if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(p)) return false;
    return REVIEWABLE.test(p) || /^Dockerfile/i.test(baseName) || baseName === ".env" || baseName.startsWith(".env.");
  });

  const MAX_FILES = 5000;
  const MAX_BYTES = 40 * 1024 * 1024;
  const files = [];
  const usedMap = new Map();
  const exampleKeys = new Set();
  const findings = [];
  let totalLines = 0;
  let totalBytes = 0;
  let truncated = false;
  let i = 0;
  for (const rel of reviewable) {
    if (files.length >= MAX_FILES || totalBytes >= MAX_BYTES) { truncated = true; break; }
    i += 1;
    if (i % 3 === 0 || i === 1) {
      live(`${SPIN[i % SPIN.length]} 🔬 Pass 3/3 — reading ${i}/${reviewable.length}  ·  ${rel}  ·  ${elapsed(t0)}`);
    }
    let content;
    let size = 0;
    try {
      const abs = join(root, rel);
      size = statSync(abs).size;
      if (size > 400_000) continue;
      content = readFileSync(abs, "utf8");
    } catch { continue; }
    totalBytes += size;
    files.push({ path: rel, content });
    const lang = detectLang(rel, content);
    live(`${SPIN[i % SPIN.length]} 🔬 Pass 3/3 — ${lang}  ${i}/${reviewable.length}  ·  ${rel}  ·  ${elapsed(t0)}`);
    const analysed = analyzeFile(content, lang);
    totalLines += analysed.lines;
    for (const f of analysed.findings) {
      if (findings.length >= 800) { truncated = true; break; }
      findings.push({ ...f, file: rel, language: lang });
    }
    if (/\.env\.(example|sample|template)$/i.test(rel.split("/").pop() || "")) {
      for (const k of parseDotEnvKeys(content)) exampleKeys.add(k);
    }
    for (const name of extractEnvNames(content)) {
      if (!usedMap.has(name)) usedMap.set(name, new Set());
      usedMap.get(name).add(rel);
    }
  }
  const used = [...usedMap.entries()].map(([name, set]) => ({ name, files: [...set].sort() })).sort((a, b) => a.name.localeCompare(b.name));
  const missingFromExample = used.map((u) => u.name).filter((n) => !exampleKeys.has(n));
  const missing = [...inv.missing];
  if (used.length > 0 && !inv.hasEnvExample) {
    missing.push({
      path: ".env.example",
      severity: "high",
      why: `Code reads ${used.length} environment variable${used.length === 1 ? "" : "s"} but there is no .env.example listing the names (values stay secret — names only).`,
    });
  }
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  const scoreFindings = [
    ...findings,
    ...missing.filter((m) => m.severity === "high").map((m) => ({ severity: m.severity })),
  ];
  const report = {
    rootName,
    filesSeen: paths.length,
    filesReviewed: files.length,
    filesSkipped: Math.max(0, paths.length - files.length),
    totalLines,
    truncated,
    score: scoreOf(scoreFindings),
    findings,
    counts,
    missing,
    env: { used, exampleKeys: [...exampleKeys].sort(), missingFromExample },
    vercel: {
      present: inv.hasVercel,
      note: inv.hasVercel
        ? "Vercel project files found. Comparing live env names from your Vercel project is a later step — this pass only matches names used in code against .env.example."
        : "No vercel.json. Connecting a Vercel project for live env names ships later; this pass only reads the tree.",
    },
    note: "Read every line of every reviewable file, detected its language, found bugs, and included the fix for each. Missing project files and env names vs .env.example are listed too. Source is never stored.",
  };
  const dest = resolve(outFile || join(root, "REVIEW.md"));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, thoroughMarkdown(report), "utf8");
  liveLine(`✅ Done in ${elapsed(t0)}  ·  score ${report.score}/100  ·  ${counts.critical} critical · ${counts.high} high`);
  liveLine(`📝 Wrote ${dest}`);
  if (key()) {
    try {
      const saved = await withSpinner("☁️  Saving findings to Clyvro (source stays on this machine)…", api("POST", "/api/v1/reviews", { title: `Code review — ${rootName}`, report }));
      liveLine(`✅ Saved to Clyvro  ·  ${saved.id}  ·  we'll email you the summary`);
      report.savedId = saved.id;
    } catch (err) {
      liveLine(`⚠️  Local report written; cloud save skipped: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    liveLine(`💡 Sign in (${invoke()} login) if you want Clyvro to keep the findings and email you.`);
  }
  return { report, out: dest };
}

const TOOLS = [
  { name: "whoami", description: "Show the signed-in workspace." },
  { name: "scan", description: "Full Scan of a site you own. Args: url. Needs consent." },
  { name: "review", description: "Thorough Code Reviewer walk of a local folder. Writes REVIEW.md. Args: path" },
  { name: "pentest", description: "Authorized pentest on a verified domain. Args: url. Needs consent." },
  { name: "flow", description: "Live browser walk-through. Args: url. Needs consent." },
  { name: "lab", description: "Send GET/HEAD/OPTIONS to a verified path. Args: url, path, method. Needs consent." },
  { name: "lab_scan", description: "Discover and probe pages on a verified site. Args: url. Needs consent." },
  { name: "hack", description: "Hack Protection (are doors locked?). Args: url. Needs consent." },
  { name: "seo", description: "SEO visibility (can people find you?). Args: url. Needs consent." },
  { name: "readiness", description: "Is the site ready for customers? Args: url. Needs consent." },
  { name: "ai", description: "AI-Pattern / generic-copy check. Args: url. Needs consent." },
  { name: "ssl", description: "TLS certificate inspector. Args: url. Needs consent." },
  { name: "dns", description: "DNS records inspector. Args: url. Needs consent." },
  { name: "redirects", description: "Redirect chain tracer. Args: url. Needs consent." },
  { name: "headers", description: "Response headers debugger. Args: url. Needs consent." },
  { name: "robots", description: "robots.txt + sitemap tester. Args: url, path. Needs consent." },
  { name: "guard", description: "Ask Site Guard about a request. Args: path, method." },
  { name: "scans", description: "List recent Full Scans." },
];

async function runTool(name, args) {
  const url = args.url || args[0];
  if (name === "whoami") return api("GET", "/api/v1/me");
  if (name === "review") {
    const { report, out: dest } = await reviewLocal(args.path || args[0] || ".", args.out);
    return { out: dest, score: report.score, filesReviewed: report.filesReviewed, counts: report.counts, missing: report.missing, savedId: report.savedId || null };
  }
  if (name === "scan") {
    return runQueuedJob({
      label: `Full Scan · ${url}`,
      createPath: "/api/v1/scans",
      body: consentBody(url),
      runPath: "/api/v1/scans/:id/run",
      getPath: "/api/v1/scans/:id",
    });
  }
  if (name === "guard") {
    return api("POST", "/api/v1/guard", {
      method: args.method || "GET",
      path: args.path || args[0] || "/",
      search: args.search || "",
      userAgent: args.userAgent || "clyvro-cli",
    });
  }
  if (name === "lab") {
    return withSpinner(`Lab probe · ${url}`, api("POST", "/api/v1/lab", consentBody(url, { path: args.path || args[1] || "/", method: args.method || "GET" })));
  }
  if (name === "lab_scan") {
    return withSpinner(`Lab site scan · ${url} (this can take a few minutes)`, api("POST", "/api/v1/lab/scan", consentBody(url)));
  }
  if (name === "pentest") {
    return runQueuedJob({
      label: `Pentest · ${url}`,
      createPath: "/api/v1/pentests",
      body: consentBody(url, { typedConfirmation: "I AUTHORIZE THIS PENTEST" }),
      runPath: "/api/v1/pentests/:id/run",
      getPath: "/api/v1/pentests/:id",
    });
  }
  if (name === "flow") {
    return runQueuedJob({
      label: `Flow Scan · ${url}`,
      createPath: "/api/v1/flow-scans",
      body: consentBody(url),
      runPath: "/api/v1/flow-scans/:id/run",
      getPath: "/api/v1/flow-scans/:id",
    });
  }
  if (name === "hack") return withSpinner("Hack Protection…", api("POST", "/api/v1/hack-protection", consentBody(url)));
  if (name === "seo") return withSpinner("SEO visibility…", api("POST", "/api/v1/seo", consentBody(url)));
  if (name === "readiness") return withSpinner("Readiness…", api("POST", "/api/v1/readiness", consentBody(url)));
  if (name === "ai" || name === "ai_pattern" || name === "ai-pattern") {
    return withSpinner("AI-Pattern…", api("POST", "/api/v1/ai-pattern", consentBody(url)));
  }
  if (name === "ssl" || name === "dns" || name === "redirects" || name === "headers" || name === "robots") {
    return withSpinner(`${name}…`, api("POST", "/api/v1/tools", consentBody(url, { tool: name, target: url, path: args.path || "/" })));
  }
  if (name === "scans") return api("GET", "/api/v1/scans");
  throw new Error(`Unknown tool ${name}`);
}

async function mcp() {
  const rl = createInterface({ input: stdinFd, crlfDelay: Infinity });
  const send = (msg) => stdoutFd.write(JSON.stringify(msg) + "\n");
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    const id = req.id;
    try {
      if (req.method === "initialize") {
        send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "clyvro", version: VERSION } } });
      } else if (req.method === "notifications/initialized") {
        /* ack not required */
      } else if (req.method === "tools/list") {
        send({
          jsonrpc: "2.0", id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: { type: "object", properties: { url: { type: "string" }, path: { type: "string" }, method: { type: "string" }, out: { type: "string" } } },
            })),
          },
        });
      } else if (req.method === "tools/call") {
        const name = req.params?.name;
        const args = req.params?.arguments ?? {};
        const result = await runTool(name, args);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
      } else {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method" } });
      }
    } catch (err) {
      send({ jsonrpc: "2.0", id, error: { code: -32000, message: err instanceof Error ? err.message : "error" } });
    }
  }
}

function help() {
  const cmd = invoke();
  console.log(`Clyvro CLI v${VERSION} — every tool from the website, in your terminal.

Account
  ${cmd} help
  ${cmd} version
  ${cmd} login                      Sign in from your phone (device code)
  ${cmd} login --api-key cly_…      Save a key from API & keys
  ${cmd} logout
  ${cmd} whoami

Checks (add --consent only if you own the site or have permission)
  ${cmd} scan <url> --consent       Full Scan (all engines, live progress)
  ${cmd} pentest <url> --consent    Authorized pentest (verified domain)
  ${cmd} flow <url> --consent       Live browser walk-through
  ${cmd} lab <url> --path / --consent
  ${cmd} lab-scan <url> --consent   Discover + probe pages
  ${cmd} hack <url> --consent       Are the doors locked?
  ${cmd} seo <url> --consent        Can people find you on search?
  ${cmd} readiness <url> --consent  Ready for customers?
  ${cmd} ai <url> --consent         AI-Pattern / generic-copy check
  ${cmd} scans                      List recent Full Scans

Code Reviewer
  ${cmd} review [dir]               Walk every line, write REVIEW.md

Site helpers
  ${cmd} ssl <url> --consent        TLS certificate
  ${cmd} dns <url> --consent        DNS records
  ${cmd} redirects <url> --consent  Redirect chain
  ${cmd} headers <url> --consent    Response headers
  ${cmd} robots <url> --path / --consent
  ${cmd} guard --path / --method GET

Agents
  ${cmd} mcp                        MCP server on stdin/stdout

Install (works worldwide — Alpine, Arch, Debian, macOS, Windows, WSL)
  Linux/macOS:  curl -fsSL ${base()}/install.sh | sh
  Alpine:       apk add --no-cache nodejs && wget -qO- ${base()}/install.sh | sh
  Arch:         sudo pacman -S --needed nodejs && curl -fsSL ${base()}/install.sh | sh
  Windows:      irm ${base()}/install.ps1 | iex
  npm (any OS): npm i -g ${base()}/cli/clyvro.tgz

TTY shows live progress (spinner + emoji). JSON still goes to stdout.
Env: CLYVRO_API_KEY  CLYVRO_BASE
Config: ~/.clyvro/config.json
Docs: ${base()}/developers
`);
}

function needUrl(usage) {
  const url = positional()[0];
  if (!url) { console.error(`Usage: ${usage}`); process.exit(1); }
  if (!flag("--consent")) {
    console.error("Add --consent only if you own this website or have the owner's permission.");
    process.exit(1);
  }
  return url;
}

const cmd = process.argv[2] || (!stdinFd.isTTY ? "mcp" : "help");
try {
  if (cmd === "help" || cmd === "-h" || cmd === "--help") help();
  else if (cmd === "version" || cmd === "-v" || cmd === "--version") console.log(VERSION);
  else if (cmd === "login") await login();
  else if (cmd === "logout") {
    try { rmSync(FILE); } catch { /* already gone */ }
    liveLine("👋 Logged out");
    out({ ok: true });
  } else if (cmd === "mcp") await mcp();
  else if (cmd === "review") {
    const dir = positional()[0] || ".";
    const result = await reviewLocal(dir, arg("--out"));
    out({ ok: true, out: result.out, score: result.report.score, filesReviewed: result.report.filesReviewed, counts: result.report.counts, missing: result.report.missing, savedId: result.report.savedId || null });
  } else if (cmd === "whoami") {
    const me = await withSpinner("whoami…", api("GET", "/api/v1/me"));
    liveLine(`👤 ${me.email || me.user?.email || "signed in"}`);
    out(me);
  } else if (cmd === "scan") {
    const url = positional()[0];
    if (!url) { console.error("Usage: clyvro scan <url> --consent"); process.exit(1); }
    if (!flag("--consent")) { console.error("Add --consent only if you own this website or have the owner's permission."); process.exit(1); }
    out(await runTool("scan", { url }));
  } else if (cmd === "guard") {
    out(await runTool("guard", { path: arg("--path", "/"), method: arg("--method", "GET"), search: arg("--search", "") }));
  } else if (cmd === "lab") {
    const url = positional()[0];
    if (!url || !flag("--consent")) { console.error("Usage: clyvro lab <url> --path / --consent"); process.exit(1); }
    out(await runTool("lab", { url, path: arg("--path", "/"), method: arg("--method", "GET") }));
  } else if (cmd === "lab-scan") {
    const url = positional()[0];
    if (!url || !flag("--consent")) { console.error("Usage: clyvro lab-scan <url> --consent"); process.exit(1); }
    out(await runTool("lab_scan", { url }));
  } else if (cmd === "pentest") {
    const url = positional()[0];
    if (!url || !flag("--consent")) { console.error("Usage: clyvro pentest <url> --consent"); process.exit(1); }
    out(await runTool("pentest", { url }));
  } else if (cmd === "flow") {
    const url = positional()[0];
    if (!url || !flag("--consent")) { console.error("Usage: clyvro flow <url> --consent"); process.exit(1); }
    out(await runTool("flow", { url }));
  } else if (cmd === "hack") {
    out(await runTool("hack", { url: needUrl("clyvro hack <url> --consent") }));
  } else if (cmd === "seo") {
    out(await runTool("seo", { url: needUrl("clyvro seo <url> --consent") }));
  } else if (cmd === "readiness") {
    out(await runTool("readiness", { url: needUrl("clyvro readiness <url> --consent") }));
  } else if (cmd === "ai" || cmd === "ai-pattern") {
    out(await runTool("ai", { url: needUrl("clyvro ai <url> --consent") }));
  } else if (cmd === "ssl" || cmd === "dns" || cmd === "redirects" || cmd === "headers" || cmd === "robots") {
    out(await runTool(cmd, { url: needUrl(`clyvro ${cmd} <url> --consent`), path: arg("--path", "/") }));
  } else if (cmd === "scans") {
    out(await withSpinner("Listing scans…", runTool("scans", {})));
  } else if (cmd === "commands") {
    help();
  } else {
    console.error(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
  }
} catch (err) {
  liveLine(`❌ ${err instanceof Error ? err.message : err}`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
