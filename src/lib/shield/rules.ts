/**
 * Clyvro Shield — pure request-inspection rules.
 *
 * Edge-safe (no Node imports): this file runs inside the middleware for
 * every request, and inside Node routes/services/tests. It only looks at
 * the request line (method, path, query) and the User-Agent — never at
 * bodies, which are validated per route.
 *
 * Design rules that keep real users safe from false positives:
 *  - Three verdict levels: `block` (unambiguous — a honeypot path, an
 *    offensive-tool User-Agent, a null byte, or a strong signature score),
 *    `suspicious` (weak signals, logged only), `allow`.
 *  - Honeypots, tool fingerprints and null bytes are enforced in every
 *    mode. Signature scores are enforced only in Enforce / Under-attack
 *    mode so the founder can watch Monitor mode first and confirm nothing
 *    legitimate trips them.
 *  - Query parameters that legitimately carry foreign URLs (`url`,
 *    `callbackUrl`, …) can only ever make a request *suspicious*: Clyvro's
 *    whole job is scanning other people's (sometimes vulnerable) sites.
 */

export type ShieldMode = "monitor" | "enforce" | "under-attack";
export const SHIELD_MODES: ShieldMode[] = ["monitor", "enforce", "under-attack"];

export type RuleFamily =
  | "honeypot" | "scanner-ua" | "null-byte" | "csrf"
  | "traversal" | "sqli" | "xss" | "cmdi" | "ssti" | "lfi" | "jndi" | "probe"
  | "xxe" | "ssrf" | "crlf" | "nosql" | "cred-stuff" | "dos" | "header-inject";

export type Verdict = "allow" | "suspicious" | "block";

/** Where a signature was found. `body` is scored by the route that reads the body. */
export type MatchWhere = "path" | "query" | "ua" | "body";

export interface Match {
  family: RuleFamily;
  rule: string;
  where: MatchWhere;
  weight: number;
}

export interface Inspection {
  verdict: Verdict;
  score: number;
  matches: Match[];
  /** True when the block does not depend on the mode (honeypot, tool UA, null byte). */
  alwaysEnforced: boolean;
  /** The headline reason shown in Admin → Security. */
  primary: RuleFamily | null;
}

export interface InspectInput {
  method: string;
  pathname: string;
  /** Raw query string including the leading `?` (or empty). */
  search: string;
  userAgent: string | null;
}

/** A signature score at or above this blocks in Enforce / Under-attack mode. */
export const BLOCK_SCORE = 3;

/* ------------------------------------------------------------------ */
/* Honeypots: paths no Clyvro user ever requests. Touching one = ban.  */
/* ------------------------------------------------------------------ */
const HONEYPOT_PATHS: { name: string; re: RegExp }[] = [
  { name: "dotenv", re: /\/\.env(?:\.[a-z0-9_-]+)?(?:\/|$)/ },
  { name: "vcs-or-tool-dir", re: /\/\.(?:git|svn|hg|aws|ssh|vscode|idea|docker)(?:\/|$)/ },
  { name: "dotfile", re: /\/\.(?:htaccess|htpasswd|ds_store|npmrc|bash_history|gitconfig)$/ },
  { name: "wordpress", re: /\/(?:wp-login\.php|wp-admin|wp-content|wp-includes|xmlrpc\.php|wlwmanifest\.xml|wp-json)(?:\/|$)/ },
  { name: "db-admin-panel", re: /\/(?:phpmyadmin|pma|myadmin|adminer|phpinfo(?:\.php)?|info\.php|mysql)(?:\/|$)/ },
  { name: "framework-console", re: /\/(?:cgi-bin|vendor\/phpunit|_profiler|telescope|_ignition|actuator|solr|jenkins|manager\/html|console|jmx-console|web-console)(?:\/|$)/ },
  { name: "device-or-vpn-exploit", re: /\/(?:hnap1|boaform|gponform|cgi-bin\/luci|shell|cmd|remote\/login|\+cscoe\+|global-protect|dana-na|owa|ecp|autodiscover)(?:\/|$)/ },
  { name: "server-internals", re: /\/(?:server-status|server-info|elmah\.axd|trace\.axd|debug\/default|_debugbar|storage\/logs|laravel\/|\.config\/)/ },
  { name: "project-secrets-file", re: /\/(?:web\.config|composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|dockerfile|docker-compose\.ya?ml|id_rsa|credentials\.json|secrets?\.(?:json|ya?ml|env))$/ },
  { name: "config-file", re: /\/(?:config|configuration|settings|database|db)\.(?:php|json|ya?ml|xml|ini|bak|old)$/ },
  { name: "backup-archive", re: /\/(?:backup|dump|db|database|site|www|html|public_html)[a-z0-9._-]*\.(?:zip|sql|sql\.gz|tar|tar\.gz|tgz|rar|7z|bak)$/ },
  { name: "graphql-exploit", re: /\/graphql(?:\/|$)/i },
  { name: "actuator-exploit", re: /\/actuator\/(?:env|beans|heapdump|gateway|jolokia)/i },
  { name: "foreign-extension", re: /\.(?:php\d?|phtml|asp|aspx|jsp|jspx|cgi|pl|cfm|bak|sql|swp|ini|old|orig)$/ },
];

/** Paths Shield never inspects: its own plumbing and the files we publish on purpose. */
export function shieldExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/shield/") ||
    // The hidden emergency door has its own strict throttle and must stay
    // reachable while an address is banned or Under-attack is on.
    pathname === "/emergency" ||
    pathname.startsWith("/api/emergency/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/.well-known/")
  );
}

/* ------------------------------------------------------------------ */
/* Offensive-tool User-Agents. Always blocked.                          */
/* ------------------------------------------------------------------ */
const SCANNER_UA = /\b(?:sqlmap|nikto|nmap|masscan|zgrab|nuclei|projectdiscovery|dirbuster|gobuster|ffuf|wpscan|acunetix|nessus|openvas|w3af|arachni|skipfish|havij|jaeles|dalfox|xsser|commix|hydra|medusa|metasploit|netsparker|appscan|whatweb|wfuzz|dirb|feroxbuster|sqlninja|zmeu|morfeus|webshag|paros|webinspect|burpsuite|burp suite|joomscan|droopescan|cmsmap|wapiti|xspider|zaproxy|owasp zap|httrack|cisco-torch|brutus|python-nmap|shodan|censys|l9explore|leakix|expanse|intrigue|ffuf|dirsearch|arjun|paramspider|waybackurls|gau|kxss|qsreplace|gf|uro|httpx|subfinder|amass|aquatone|eyewitness|gospider|hakrawler|katana)\b/i;

/* ------------------------------------------------------------------ */
/* Signatures (decoded path + decoded query values).                   */
/* weight 3 = strong on its own, 2 = needs company, 1 = weak hint.      */
/* ------------------------------------------------------------------ */
interface Signature { family: RuleFamily; rule: string; re: RegExp; weight: number }

const SIGNATURES: Signature[] = [
  // Path traversal / local file inclusion
  { family: "traversal", rule: "dot-dot-slash", re: /(?:\.\.[\\/]){2,}|\.\.%2f|%2e%2e[\\/]/i, weight: 3 },
  { family: "traversal", rule: "dot-dot-once", re: /(?:^|[\\/])\.\.(?:[\\/]|$)/, weight: 1 },
  { family: "lfi", rule: "system-file", re: /\/(?:etc\/(?:passwd|shadow|hosts|issue)|proc\/self|windows\/win\.ini|boot\.ini|wp-config\.php)/i, weight: 3 },
  { family: "lfi", rule: "stream-wrapper", re: /\b(?:php|file|expect|phar|zip|glob|dict|gopher|ldap):\/\//i, weight: 3 },
  // SQL injection
  { family: "sqli", rule: "union-select", re: /\bunion\b[\s/*+]+(?:all[\s/*+]+)?\bselect\b/i, weight: 3 },
  { family: "sqli", rule: "time-based", re: /\b(?:sleep|pg_sleep|benchmark)\s*\(|\bwaitfor\s+delay\b/i, weight: 3 },
  { family: "sqli", rule: "schema-probe", re: /\binformation_schema\b|\bsysobjects\b|@@version|\bxp_cmdshell\b|\bload_file\s*\(/i, weight: 3 },
  { family: "sqli", rule: "tautology", re: /['"`)]\s*(?:or|and)\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+/i, weight: 3 },
  { family: "sqli", rule: "select-from", re: /\bselect\b[\s\S]{1,80}\bfrom\b/i, weight: 2 },
  { family: "sqli", rule: "comment-tail", re: /['"]\s*(?:--|#|\/\*)\s*$/, weight: 2 },
  { family: "sqli", rule: "hex-blob", re: /0x[0-9a-f]{12,}/i, weight: 1 },
  { family: "sqli", rule: "string-functions", re: /\b(?:concat|char|chr|ascii|substring|mid|cast|convert)\s*\(/i, weight: 1 },
  // Cross-site scripting
  { family: "xss", rule: "script-tag", re: /<\s*script\b|<\s*\/\s*script\s*>/i, weight: 3 },
  { family: "xss", rule: "event-handler", re: /\bon(?:error|load|mouseover|focus|click|animationstart|toggle|pointerenter)\s*=/i, weight: 3 },
  { family: "xss", rule: "javascript-url", re: /\bjavascript\s*:/i, weight: 2 },
  { family: "xss", rule: "dangerous-tag", re: /<\s*(?:iframe|object|embed|svg|img|video|details|math|base|meta)\b/i, weight: 2 },
  { family: "xss", rule: "dom-sink", re: /\bdocument\s*\.\s*(?:cookie|write|location|domain)\b|\bwindow\s*\.\s*location\b|\beval\s*\(/i, weight: 2 },
  { family: "xss", rule: "alert-probe", re: /\b(?:alert|prompt|confirm)\s*\(/i, weight: 1 },
  // OS command injection
  { family: "cmdi", rule: "shell-chain", re: /(?:;|\||&&|\$\(|`|%0a|\n)\s*(?:cat|ls|id|whoami|uname|wget|curl|nc|ncat|bash|sh|python\d?|perl|php|powershell|cmd(?:\.exe)?|ping|nslookup|dig)\b/i, weight: 3 },
  { family: "cmdi", rule: "shell-path", re: /\/bin\/(?:ba|z|da)?sh\b|\/usr\/bin\/(?:wget|curl|python)/i, weight: 3 },
  { family: "cmdi", rule: "subshell", re: /\$\([^)]{1,40}\)|\$\{IFS\}/i, weight: 2 },
  // Server-side template injection
  { family: "ssti", rule: "template-math", re: /\{\{\s*\d+\s*[*+]\s*\d+\s*\}\}|\$\{\s*\d+\s*[*+]\s*\d+\s*\}|<%=\s*\d+\s*[*+]\s*\d+/i, weight: 3 },
  { family: "ssti", rule: "template-object", re: /\{\{\s*(?:config|self|request|lipsum|cycler|joiner|namespace)\b/i, weight: 3 },
  // Log4Shell-style lookups
  { family: "jndi", rule: "jndi-lookup", re: /\$\{\s*(?:jndi|lower|upper|env|sys|java|date|ctx)\s*:/i, weight: 3 },
  { family: "xxe", rule: "xxe-doctype", re: /<!DOCTYPE[^>]*\b(?:ENTITY|SYSTEM)\b/i, weight: 3 },
  { family: "xxe", rule: "xxe-external-entity", re: /<!ENTITY\s+[^>]*\b(?:SYSTEM|PUBLIC)\b/i, weight: 3 },
  { family: "ssrf", rule: "ssrf-meta-ip", re: /\b169\.254\.169\.254\b|\bmetadata\.google\b|\bmetadata\.aws\b/i, weight: 3 },
  { family: "ssrf", rule: "ssrf-gopher-ldap", re: /\b(?:gopher|dict|ldap|tftp):\/\//i, weight: 2 },
  { family: "crlf", rule: "crlf-inject", re: /%0d%0a|%0a%0d|\\r\\n/i, weight: 3 },
  { family: "nosql", rule: "nosql-operator", re: /\$(?:where|ne|gt|lt|gte|lte|in|nin|regex|exists|or)\b/i, weight: 2 },
  { family: "cred-stuff", rule: "auth-bypass", re: /\badmin['\"]\s*(?:--|#)|\b'\s*or\s*'1'\s*=\s*'1/i, weight: 3 },
  { family: "dos", rule: "repeater", re: /(?:\.\.\/){5,}|(?:%2e){10,}/i, weight: 3 },
  { family: "header-inject", rule: "host-override", re: /\bx-forwarded-host\b|\bx-original-url\b|\bx-rewrite-url\b/i, weight: 2 },
];

/** Query parameters that legitimately carry other people's URLs or free text. */
const LENIENT_QUERY_KEYS = new Set(["url", "target", "site", "siteurl", "domain", "callbackurl", "redirect", "redirect_uri", "returnto", "next", "q", "query", "search"]);

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function decodeLoose(value: string): string {
  let out = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(out.replace(/\+/g, " "));
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

function containsNullByte(raw: string): boolean {
  return /%00/i.test(raw) || raw.includes("\u0000");
}

function matchSignatures(text: string, where: MatchWhere, cap?: number): Match[] {
  const found: Match[] = [];
  for (const sig of SIGNATURES) {
    if (sig.re.test(text)) {
      found.push({ family: sig.family, rule: sig.rule, where, weight: cap === undefined ? sig.weight : Math.min(sig.weight, cap) });
    }
  }
  return found;
}

/**
 * Masked, human-readable form of an address for admin screens (never the full IP).
 *
 * Strictly ASCII on purpose: this string travels in `x-shield-ip-masked` from
 * the edge to /api/shield/blocked, and a header value must be Latin-1. A
 * typographic ellipsis here made every block of an IPv6 address throw
 * "Cannot convert argument to a ByteString" — a 500 instead of a 403, for
 * exactly the clients an attacker is most likely to use.
 */
export function maskIp(ip: string): string {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return `${parts.slice(0, 3).join(":")}::x`;
  }
  return ip === "unknown" ? "unknown" : `${ip.slice(0, 6)}...`;
}

/** Best-effort client address from proxy headers (Vercel sets x-forwarded-for; first hop is the client). */
export function requestIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/* ------------------------------------------------------------------ */
/* Inspection                                                           */
/* ------------------------------------------------------------------ */
/**
 * Scores free text with the same signatures used for the request line —
 * used by the body scorer (`./body.ts`) and by tests. Each (family, rule,
 * where) triple counts once, so a repeated pattern cannot inflate itself.
 */
export function scoreText(text: string, where: MatchWhere = "body", cap?: number): { matches: Match[]; score: number } {
  const matches = matchSignatures(text, where, cap);
  const seen = new Set<string>();
  let score = 0;
  for (const m of matches) {
    const key = `${m.family}:${m.rule}:${m.where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    score += m.weight;
  }
  return { matches, score };
}

export function inspectRequest(input: InspectInput): Inspection {
  const matches: Match[] = [];
  const rawPath = input.pathname;
  const path = decodeLoose(rawPath);
  const pathLower = path.toLowerCase();

  if (containsNullByte(rawPath) || containsNullByte(input.search)) {
    matches.push({ family: "null-byte", rule: "null-byte", where: "path", weight: 3 });
  }

  if (!pathLower.startsWith("/.well-known/")) {
    for (const trap of HONEYPOT_PATHS) {
      if (trap.re.test(pathLower)) {
        matches.push({ family: "honeypot", rule: trap.name, where: "path", weight: 3 });
        break;
      }
    }
  }

  const ua = input.userAgent ?? "";
  if (ua && SCANNER_UA.test(ua)) {
    matches.push({ family: "scanner-ua", rule: (ua.match(SCANNER_UA)?.[0] ?? "tool").toLowerCase(), where: "ua", weight: 3 });
  }

  matches.push(...matchSignatures(path, "path"));

  if (input.search && input.search.length > 1) {
    let params: URLSearchParams | null = null;
    try { params = new URLSearchParams(input.search); } catch { params = null; }
    if (params) {
      for (const [key, value] of params) {
        if (!value) continue;
        const lenient = LENIENT_QUERY_KEYS.has(key.toLowerCase());
        matches.push(...matchSignatures(decodeLoose(value), "query", lenient ? 1 : undefined));
        matches.push(...matchSignatures(decodeLoose(key), "query"));
      }
    } else {
      matches.push(...matchSignatures(decodeLoose(input.search), "query"));
    }
  }

  const alwaysEnforced = matches.some((m) => m.family === "honeypot" || m.family === "scanner-ua" || m.family === "null-byte");
  // Score counts each (family, rule) once so a repeated pattern cannot inflate itself.
  const seen = new Set<string>();
  let score = 0;
  for (const m of matches) {
    const k = `${m.family}:${m.rule}:${m.where}`;
    if (seen.has(k)) continue;
    seen.add(k);
    score += m.weight;
  }

  const verdict: Verdict = alwaysEnforced || score >= BLOCK_SCORE ? "block" : score > 0 ? "suspicious" : "allow";
  const primary = matches.length === 0 ? null : [...matches].sort((a, b) => b.weight - a.weight)[0]!.family;
  return { verdict, score, matches, alwaysEnforced, primary };
}

/* ------------------------------------------------------------------ */
/* Cross-site request forgery guard                                     */
/* ------------------------------------------------------------------ */
/** Inbound webhooks and machine endpoints are called cross-site on purpose. */
const CSRF_EXEMPT_PREFIXES = ["/api/billing/webhook", "/api/github/webhook", "/api/github/events", "/api/cron/", "/api/shield/", "/api/auth/callback/"];

export function csrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * True when a state-changing /api request demonstrably comes from another
 * site. Browsers always send `Origin` (and `Sec-Fetch-Site`) on cross-site
 * POST/PUT/PATCH/DELETE, so a mismatch is a forgery attempt; requests with
 * no Origin at all (curl, server-to-server) are left alone.
 */
export function isCrossSiteWrite(method: string, pathname: string, headers: Headers, host: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (!pathname.startsWith("/api/") || csrfExempt(pathname)) return false;
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = headers.get("origin");
  if (!origin || origin === "null") return fetchSite === "cross-site";
  try {
    return new URL(origin).host.toLowerCase() !== host.toLowerCase();
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Rate-limit classes                                                   */
/* ------------------------------------------------------------------ */
export type RouteClass = "auth" | "public-write" | "api" | "page";

export function routeClass(method: string, pathname: string): RouteClass {
  const m = method.toUpperCase();
  if (pathname.startsWith("/api/auth/") && m !== "GET") return "auth";
  if (m !== "GET" && m !== "HEAD" && (pathname === "/api/scan" || pathname === "/api/waitlist" || pathname === "/api/public-scan")) return "public-write";
  if (pathname.startsWith("/api/")) return "api";
  return "page";
}

export interface RateLimitSpec { limit: number; windowMs: number }

/** Generous by design: real browsers and the audit poller never approach these. Under attack: a quarter. */
export function limitFor(cls: RouteClass, mode: ShieldMode): RateLimitSpec {
  const base: Record<RouteClass, RateLimitSpec> = {
    auth: { limit: 30, windowMs: 10 * 60_000 },
    "public-write": { limit: 40, windowMs: 10 * 60_000 },
    api: { limit: 400, windowMs: 60_000 },
    page: { limit: 300, windowMs: 60_000 },
  };
  const spec = base[cls];
  return mode === "under-attack" ? { limit: Math.max(5, Math.floor(spec.limit / 4)), windowMs: spec.windowMs } : spec;
}

/* ------------------------------------------------------------------ */
/* Decision                                                             */
/* ------------------------------------------------------------------ */
export type ShieldAction = "allow" | "block" | "log";

/** What to do with an inspection in the current mode. */
export function decide(inspection: Inspection, mode: ShieldMode): ShieldAction {
  if (inspection.verdict === "block") {
    if (inspection.alwaysEnforced) return "block";
    return mode === "monitor" ? "log" : "block";
  }
  if (inspection.verdict === "suspicious") return "log";
  return "allow";
}

/** Stable string used for hashing addresses/accounts; the secret keeps hashes unguessable. */
export function hashInput(kind: "ip" | "account", value: string, secret: string): string {
  return `${secret}|shield|${kind}|${value.trim().toLowerCase()}`;
}

/** SHA-256 hex via WebCrypto — identical on the edge, in Node and in tests. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashIp(ip: string, secret: string): Promise<string> {
  return sha256Hex(hashInput("ip", ip, secret));
}

export async function hashAccount(email: string, secret: string): Promise<string> {
  return sha256Hex(hashInput("account", email, secret));
}

/** Header carrying the shared internal token between the edge and Node routes. */
export const INTERNAL_HEADER = "x-clyvro-shield";

export async function internalToken(secret: string): Promise<string> {
  return sha256Hex(`${secret}|shield-internal`);
}

/* ------------------------------------------------------------------ */
/* Plain-language rule catalogue for Admin → Security                   */
/* ------------------------------------------------------------------ */
export const RULE_CATALOGUE: { family: RuleFamily; title: string; what: string; enforced: "always" | "mode" }[] = [
  { family: "honeypot", title: "Honeypot paths", what: "Requests for files and admin panels Clyvro does not have (.env, .git, wp-login.php, phpMyAdmin, cgi-bin, backup.zip…). Only scanners ask for these.", enforced: "always" },
  { family: "scanner-ua", title: "Attack-tool fingerprints", what: "User-Agents of offensive tools (sqlmap, nikto, nmap, nuclei, masscan, wpscan, acunetix, nessus…).", enforced: "always" },
  { family: "null-byte", title: "Null bytes", what: "%00 in a URL — a classic trick to cut strings short inside parsers.", enforced: "always" },
  { family: "sqli", title: "SQL injection", what: "UNION SELECT, sleep()/pg_sleep(), information_schema, ' OR 1=1 and friends in the path or query.", enforced: "mode" },
  { family: "xss", title: "Cross-site scripting", what: "<script>, onerror=, javascript: URLs, document.cookie and similar in the path or query.", enforced: "mode" },
  { family: "cmdi", title: "Command injection", what: "Shell chains such as ;cat /etc/passwd, $(…), /bin/sh, wget/curl pipelines.", enforced: "mode" },
  { family: "traversal", title: "Path traversal", what: "../../ sequences and their encoded forms.", enforced: "mode" },
  { family: "lfi", title: "File inclusion", what: "/etc/passwd, /proc/self, php:// and other stream wrappers.", enforced: "mode" },
  { family: "ssti", title: "Template injection", what: "{{7*7}}, ${7*7}, {{config}} style probes.", enforced: "mode" },
  { family: "jndi", title: "Log4Shell lookups", what: "${jndi:\u2026} and related ${\u2026:} lookups.", enforced: "mode" },
  { family: "xxe", title: "XML external entities", what: "<!DOCTYPE / <!ENTITY SYSTEM patterns.", enforced: "mode" },
  { family: "ssrf", title: "Server-side request forgery", what: "169.254.169.254 and cloud metadata probes.", enforced: "mode" },
  { family: "crlf", title: "CRLF injection", what: "%0d%0a line-break smuggling.", enforced: "mode" },
  { family: "nosql", title: "NoSQL injection", what: "$where, $ne/$gt operators.", enforced: "mode" },
  { family: "cred-stuff", title: "Credential stuffing", what: "admin\'-- and brute-force login paths.", enforced: "mode" },
  { family: "dos", title: "Denial-of-service probing", what: "Repeated traversal and oversized payloads.", enforced: "mode" },
  { family: "header-inject", title: "Host header injection", what: "x-forwarded-host override attempts.", enforced: "mode" },
  { family: "csrf", title: "Cross-site request forgery", what: "A browser on another website trying to POST to Clyvro's API with your cookies (Origin / Sec-Fetch-Site mismatch). Webhooks and cron endpoints are exempt.", enforced: "always" },
];
