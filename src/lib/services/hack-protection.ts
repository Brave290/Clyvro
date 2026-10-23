import { assertPublicUrl, type Resolver } from "@/lib/scanner/ssrf";
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";
import { ownProductScanHeaders, PRODUCT_SCAN_UA } from "@/lib/shield/product-scan";

/**
 * Hack Protection (Beta): a safe, read-only security posture scan of a
 * public website. It never submits forms, never sends credentials and
 * never tries to exploit anything — it checks what any visitor (or
 * attacker) can already see: transport security, security headers,
 * cookie flags, information disclosure, and whether well-known
 * sensitive files are publicly reachable. Every check is labelled with
 * what was actually observed; anything unreachable is reported as
 * "info", never guessed.
 */

export type HackStatus = "pass" | "warn" | "fail" | "info";
export interface HackCheck {
  id: string;
  group: string;
  label: string;
  status: HackStatus;
  detail: string;
  /** Concrete fix steps shown when the check is not a pass. */
  fix?: string[];
}
export interface HackReport {
  domain: string;
  finalUrl: string | null;
  checks: HackCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
  probedPaths: { path: string; status: number | null }[];
}

const SENSITIVE_PATHS = [
  "/.env",
  "/.git/HEAD",
  "/.git/config",
  "/wp-config.php.bak",
  "/server-status",
  "/.DS_Store",
] as const;

export async function runHackProtectionEngine(
  input: string,
  deps: { transport?: Transport; resolver?: Resolver; extraHeaders?: Record<string, string>; userAgent?: string } = {},
): Promise<HackReport> {
  const normalized = normalizeScanInput(input.trim());
  const target = await assertPublicUrl(normalized, deps.resolver);
  const host = target.url.hostname;
  const apex = host.replace(/^www\./, "");
  const extraHeaders = deps.extraHeaders ?? await ownProductScanHeaders(host);
  const opts = {
    timeoutMs: 7000,
    transport: deps.transport,
    resolver: deps.resolver,
    userAgent: deps.userAgent ?? PRODUCT_SCAN_UA,
    extraHeaders,
  };

  const [main, httpVersion, ...probes] = await Promise.all([
    fetchPublic(new URL(`https://${host}`), { ...opts, maxBytes: 300_000 }).catch(() => null),
    fetchPublic(new URL(`http://${host}`), { ...opts, headersOnly: true }).catch(() => null),
    ...SENSITIVE_PATHS.map((p) =>
      fetchPublic(new URL(`https://${host}${p}`), { ...opts, headersOnly: true, allowNonHtmlBody: true }).catch(() => null),
    ),
  ]);

  if (!main) {
    throw new ScanError("FETCH_FAILED", "We couldn't reach that website over HTTPS, so there's nothing to assess yet. Check the address and try again.");
  }

  const checks: HackCheck[] = [];
  const add = (id: string, group: string, label: string, status: HackStatus, detail: string, fix?: string[]) =>
    checks.push({ id, group, label, status, detail, fix });
  const headers = main.headers ?? {};
  const html = main.bodyText ?? "";

  // --- Transport ---
  add("reachable", "Transport", "Website answers over HTTPS",
    main.status >= 200 && main.status < 300 ? "pass" : "warn",
    `Final response HTTP ${main.status} at ${main.finalUrl} (${(main.durationMs / 1000).toFixed(1)}s).`);
  const upgrades = httpVersion ? httpVersion.finalUrl.startsWith("https://") : false;
  add("http-upgrade", "Transport", "Plain HTTP upgrades to HTTPS",
    upgrades ? "pass" : "warn",
    httpVersion
      ? upgrades
        ? `http://${host} ends at ${httpVersion.finalUrl}.`
        : `http://${host} answered HTTP ${httpVersion.status} without upgrading — traffic can be read or altered in transit.`
      : "The plain-HTTP version didn't answer at all (blocked entirely — acceptable).",
    ["Redirect every http:// request to its https:// equivalent (301) at your host/CDN.", "Then enable HSTS so browsers never try HTTP again."]);
  add("hsts", "Transport", "HSTS (force HTTPS)",
    headers["strict-transport-security"] ? "pass" : "warn",
    headers["strict-transport-security"]
      ? `Present: ${headers["strict-transport-security"].slice(0, 120)}`
      : "Missing — browsers can still be downgraded to plain HTTP on first visit.",
    ["Send `Strict-Transport-Security: max-age=63072000; includeSubDomains` once every page works over HTTPS.", "Add `preload` only when you're sure HTTPS is permanent."]);
  add("mixed-content", "Transport", "No mixed content on the homepage",
    /http:\/\/(?!www\.w3\.org|schemas\.|purl\.org)/i.test(html) && main.finalUrl.startsWith("https://") ? "warn" : "pass",
    /http:\/\//i.test(html)
      ? "The HTTPS homepage references at least one http:// resource — browsers block or warn on those."
      : "No plain-HTTP resources were referenced by the HTTPS homepage.",
    ["Change every http:// script, image and stylesheet URL to https:// (or a relative URL).", "Re-scan after the change — browsers silently block mixed scripts."]);

  // --- Security headers ---
  const hdr = (id: string, label: string, name: string, missing: string, fix: string[]) =>
    add(id, "Security headers", label, headers[name] ? "pass" : "warn",
      headers[name] ? `Present: ${headers[name].slice(0, 140)}` : `Missing — ${missing}`, fix);
  hdr("nosniff", "X-Content-Type-Options", "x-content-type-options",
    "browsers may guess file types and execute uploads as scripts.",
    ["Add the response header `X-Content-Type-Options: nosniff` on every route."]);
  add("frame-protection", "Security headers", "Clickjacking protection",
    headers["x-frame-options"] || /frame-ancestors/i.test(headers["content-security-policy"] ?? "") ? "pass" : "warn",
    headers["x-frame-options"]
      ? `X-Frame-Options: ${headers["x-frame-options"]}`
      : "No X-Frame-Options and no CSP frame-ancestors — another site can embed yours in an iframe and trick your visitors.",
    ["Send `X-Frame-Options: DENY` (or SAMEORIGIN if you embed your own pages).", "Or set `frame-ancestors 'none'` in your Content-Security-Policy."]);
  hdr("referrer-policy", "Referrer-Policy", "referrer-policy",
    "full page URLs (which can contain tokens or private paths) leak to third parties.",
    ["Send `Referrer-Policy: strict-origin-when-cross-origin`."]);
  hdr("csp", "Content-Security-Policy", "content-security-policy",
    "no CSP means an injected script runs with full page privileges.",
    ["Start with `default-src 'self'; frame-ancestors 'none'; object-src 'none'` and add the sources your site actually uses.", "Use your platform's report-only mode first if you're unsure what will break."]);
  hdr("permissions-policy", "Permissions-Policy", "permissions-policy",
    "browser features (camera, microphone, location) aren't explicitly denied.",
    ["Send `Permissions-Policy: camera=(), microphone=(), geolocation=()` and allow only features you use."]);
  // CSP strength (graduation check): presence isn't enough — a policy
  // whose script sources allow 'unsafe-inline'/'unsafe-eval' or any
  // origin is largely decorative against XSS.
  const cspValue = headers["content-security-policy"];
  if (cspValue) {
    const directives = cspValue.split(";").map((d) => d.trim()).filter(Boolean);
    const scriptSrc = directives.find((d) => /^script-src\b/i.test(d)) ?? directives.find((d) => /^default-src\b/i.test(d)) ?? "";
    const weak = [
      /'unsafe-inline'/i.test(scriptSrc) ? "'unsafe-inline' in script sources" : null,
      /'unsafe-eval'/i.test(scriptSrc) ? "'unsafe-eval' in script sources" : null,
      directives.some((d) => d.split(/\s+/).slice(1).includes("*")) ? "a wildcard (*) source" : null,
    ].filter(Boolean) as string[];
    add("csp-strength", "Security headers", "CSP is actually strict",
      weak.length === 0 ? "pass" : "warn",
      weak.length === 0
        ? "Script sources carry no 'unsafe-inline'/'unsafe-eval' and no directive uses a wildcard."
        : `Present but weakened: ${weak.join("; ")} — injected markup can still run script, which is the main attack a CSP exists to stop.`,
      ["Remove 'unsafe-inline' from script-src by moving inline scripts to files or authorising them per-response with a nonce ('nonce-…') or by hash.", "Drop 'unsafe-eval' and replace any * source with the specific origins you need.", "Roll out with Content-Security-Policy-Report-Only first so nothing breaks silently."]);
  }
  if (headers["cross-origin-opener-policy"]) {
    add("coop", "Security headers", "Cross-Origin-Opener-Policy", "pass", `Present: ${headers["cross-origin-opener-policy"].slice(0, 80)}`);
  }

  // --- Cookies (names + flags only; values are never captured) ---
  const cookies = main.cookieFlags ?? [];
  if (cookies.length === 0) {
    add("cookies", "Cookies", "Session cookie flags", "info",
      "The homepage set no cookies, so there were no flags to inspect. Sign-in pages are where Secure/HttpOnly matter most — re-check after logging in if this site has accounts.");
  } else {
    const weak = cookies.filter((c) => !c.secure || !c.httpOnly);
    add("cookies", "Cookies", "Session cookie flags",
      weak.length === 0 ? "pass" : "warn",
      weak.length === 0
        ? `${cookies.length} cookie(s) all carry Secure + HttpOnly.`
        : `${weak.map((c) => c.name).join(", ")} ${weak.length === 1 ? "is" : "are"} missing Secure and/or HttpOnly — session theft gets easier.`,
      ["Set `Secure` so the cookie only travels over HTTPS.", "Set `HttpOnly` so page scripts can't read it.", "Add `SameSite=Lax` (or Strict) unless you truly need cross-site sending."]);
  }

  // --- Information disclosure ---
  add("server-banner", "Information disclosure", "Server / framework banners",
    headers["x-powered-by"] || headers["server"] ? "info" : "pass",
    headers["x-powered-by"] || headers["server"]
      ? `The site advertises ${[headers["server"], headers["x-powered-by"]].filter(Boolean).join(" / ")} — not a hole by itself, but it helps attackers pick exploits for known versions.`
      : "No Server or X-Powered-By banner was sent.",
    ["Remove `X-Powered-By` and trim `Server` to a generic value at your host or framework."]);

  // --- Exposed sensitive files (read-only probes) ---
  const probedPaths = SENSITIVE_PATHS.map((p, i) => ({ path: p, status: probes[i]?.status ?? null }));
  const exposed = probedPaths.filter((p) => p.status !== null && p.status >= 200 && p.status < 300);
  add("exposed-files", "Exposed files", "Sensitive files not publicly reachable",
    exposed.length === 0 ? "pass" : "fail",
    exposed.length === 0
      ? `None of ${SENSITIVE_PATHS.join(", ")} answered with content (blocked, missing, or redirected to safety).`
      : `${exposed.map((p) => `${p.path} (HTTP ${p.status})`).join(", ")} answered publicly — files like these can leak credentials or source code.`,
    ["Block `/.env`, `/.git/` and backup files at the server/CDN — return 404 or 403.", "Move secrets out of the web root and rotate any credential that was ever in an exposed file.", "Re-run this scan to confirm the fix."]);

  const scored = checks.filter((c) => c.status !== "info");
  return {
    domain: apex,
    finalUrl: main.finalUrl,
    checks,
    summary: {
      pass: scored.filter((c) => c.status === "pass").length,
      warn: scored.filter((c) => c.status === "warn").length,
      fail: scored.filter((c) => c.status === "fail").length,
      total: scored.length,
    },
    probedPaths,
  };
}
