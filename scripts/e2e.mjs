#!/usr/bin/env node
/**
 * Clyvro end-to-end smoke test — runs from a terminal against a live
 * instance (local `next start` or a deployment) and exercises the real
 * HTTP surface: security headers, Clyvro Shield (honeypots, bans,
 * rate limits, CSRF guard), the hidden emergency door, trusted-browser
 * cookies, account lockout, cron jobs with full response capture, and a
 * public scan of a real website.
 *
 *   node scripts/e2e.mjs http://localhost:3111
 *
 * Options (env):
 *   E2E_ADMIN_EMAIL     admin account to create/use (default: the built-in founder address)
 *   E2E_ADMIN_PASSWORD  its password (default: a generated one, printed)
 *   E2E_SKIP_SCAN=1     skip the public scan (slow on narrow pipes)
 *   E2E_CRON_URL        target for the cron job (default https://api.github.com/zen)
 *   E2E_SCAN_URL        target for the public scan (default https://github.com)
 *
 * The script never deletes anything it did not create. Against production,
 * it will create two accounts (an admin — only if the email is already a
 * platform admin — and a throwaway member) and one cron job it then deletes.
 */

const base = (process.argv[2] ?? "http://localhost:3111").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "legateakanjimusab@gmail.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? `E2e-${Math.random().toString(36).slice(2)}-pass-${Date.now().toString(36)}`;
const MEMBER_EMAIL = `e2e-member-${Date.now().toString(36)}@example.com`;
const MEMBER_PASSWORD = "member-e2e-password-123";
const EMERGENCY_KEY = process.env.E2E_EMERGENCY_KEY ?? "";
const CRON_URL = process.env.E2E_CRON_URL ?? "https://api.github.com/zen";
const SCAN_URL = process.env.E2E_SCAN_URL ?? "https://github.com";

// Fresh address blocks per run so the script can be re-run against the same
// database (bans, throttles and sign-up limits are keyed by address).
const RUN = Math.floor(Math.random() * 200) + 20;
const good = (n) => `198.51.${RUN}.${n}`;
const evil = (n) => `203.0.${RUN}.${n}`;

const results = [];
let failures = 0;
const t0 = Date.now();

function log(line = "") { process.stdout.write(`${line}\n`); }
function ok(name, detail = "") { results.push({ name, ok: true, detail }); log(`  ✔ ${name}${detail ? `  — ${detail}` : ""}`); }
function fail(name, detail = "") { failures += 1; results.push({ name, ok: false, detail }); log(`  ✘ ${name}${detail ? `  — ${detail}` : ""}`); }
function check(cond, name, detail = "") { (cond ? ok : fail)(name, detail); return cond; }
function section(title) { log(`\n${title}`); log("─".repeat(Math.min(72, title.length + 8))); }

/** Minimal cookie jar keyed by name (single host). */
class Jar {
  constructor() { this.cookies = new Map(); }
  absorb(res) {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair, ...attrs] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAge = attrs.map((a) => a.trim().toLowerCase()).find((a) => a.startsWith("max-age="));
      if (maxAge && Number(maxAge.split("=")[1]) <= 0) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
  has(name) { return this.cookies.has(name); }
  get(name) { return this.cookies.get(name); }
}

async function req(path, { method = "GET", ip, jar, headers = {}, body, json, redirect = "manual" } = {}) {
  const h = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) ClyvroE2E/1.0", ...headers };
  if (ip) h["x-forwarded-for"] = ip;
  if (jar && jar.header()) h.cookie = jar.header();
  let payload = body;
  if (json !== undefined) { h["content-type"] = "application/json"; payload = JSON.stringify(json); }
  const res = await fetch(`${base}${path}`, { method, headers: h, body: payload, redirect, signal: AbortSignal.timeout(90_000) });
  if (jar) jar.absorb(res);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, data };
}

/** Auth.js credentials-style sign-in exactly as the browser client does it. */
async function signInWith(jar, provider, fields, ip) {
  const csrf = await req("/api/auth/csrf", { jar, ip });
  const csrfToken = csrf.data?.csrfToken;
  const res = await req(`/api/auth/callback/${provider}`, {
    method: "POST", jar, ip,
    headers: { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1", origin: base },
    body: new URLSearchParams({ ...fields, csrfToken, callbackUrl: `${base}/app/scan` }).toString(),
  });
  const url = res.data?.url ?? "";
  const errored = /error=/.test(url);
  const session = [...jar.cookies.keys()].some((k) => k.includes("session-token"));
  return { status: res.status, url, success: !errored && session, res };
}

async function register(email, password, ip, name = "E2E") {
  return req("/api/auth/register", { method: "POST", ip, json: { name, email, password, organizationName: `${name} workspace` }, headers: { "x-clyvro-device": `e2e-${ip}-${RUN}` } });
}

async function main() {
  log(`Clyvro end-to-end test against ${base}`);
  log(`admin: ${ADMIN_EMAIL} · member: ${MEMBER_EMAIL}`);

  /* ---------------------------------------------------------------- */
  section("1. Pages & security headers");
  for (const p of ["/", "/scan", "/pricing", "/how-it-works", "/security", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/emergency"]) {
    const r = await req(p, { ip: good(10) });
    check(r.status === 200, `GET ${p} → ${r.status}`);
  }
  const home = await req("/", { ip: good(10) });
  const H = (n) => home.headers.get(n);
  check(!!H("strict-transport-security"), "HSTS present", H("strict-transport-security") ?? "");
  check(H("x-frame-options") === "DENY", "X-Frame-Options DENY");
  check(H("x-content-type-options") === "nosniff", "nosniff");
  check((H("content-security-policy") ?? "").includes("nonce-"), "CSP with per-request nonce");
  check(H("cross-origin-opener-policy") === "same-origin-allow-popups", "COOP same-origin-allow-popups (Google popup still works)");
  check(!H("x-powered-by"), "X-Powered-By removed");
  const emergency = await req("/emergency", { ip: good(10) });
  check((emergency.headers.get("x-robots-tag") ?? "").includes("noindex") && /name="robots"[^>]*noindex/i.test(emergency.text), "/emergency is noindex (header + meta)");
  check(!/href="\/emergency"/.test(home.text), "/emergency is not linked from the homepage");
  const sitemap = await req("/sitemap.xml", { ip: good(10) });
  check(!sitemap.text.includes("/emergency"), "/emergency is not in the sitemap");
  const scanPage = await req("/scan", { ip: good(10) });
  check(scanPage.text.includes("form-control form-control-icon") && !scanPage.text.includes("form-control pl-10"), "/scan input reserves space for the globe icon (no overlap)");
  check(home.text.includes('id="pricing"'), "landing page renders the pricing section");
  const signIn = await req("/sign-in", { ip: good(10) });
  check(signIn.text.includes("Sign in to Clyvro") && signIn.text.includes("aria-pressed"), "new sign-in page renders (show/hide password control present)");

  /* ---------------------------------------------------------------- */
  section("2. Clyvro Shield — honeypots, bans, rate limits");
  const attacker = evil(50);
  const trap = await req("/wp-login.php", { ip: attacker });
  check(trap.status === 403 && trap.headers.get("x-clyvro-shield") === "blocked", `honeypot /wp-login.php → ${trap.status} (${trap.headers.get("x-clyvro-shield")})`);
  // Give the edge snapshot a moment to pick up the ban (refresh ≈ 10 s), probing meanwhile.
  let bannedStatus = null;
  for (let i = 0; i < 16 && bannedStatus !== 403; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const probe = await req("/pricing", { ip: attacker });
    bannedStatus = probe.status;
    if (probe.headers.get("x-clyvro-shield") === "banned") break;
  }
  check(bannedStatus === 403, `attacker address is banned afterwards (/pricing → ${bannedStatus})`);
  const envTrap = await req("/.env", { ip: evil(51) });
  check(envTrap.status === 403, `/.env honeypot → ${envTrap.status}`);
  const tool = await req("/pricing", { ip: evil(52), headers: { "user-agent": "sqlmap/1.7" } });
  check(tool.status === 403, `attack-tool User-Agent → ${tool.status}`);
  const emergencyWhileBanned = await req("/emergency", { ip: attacker });
  check(emergencyWhileBanned.status === 200, `banned address can still open /emergency → ${emergencyWhileBanned.status}`);
  // Auth rate class: 30 POSTs per 10 minutes per address.
  let limited = null;
  for (let i = 0; i < 34; i += 1) {
    const r = await req("/api/auth/csrf", { method: "POST", ip: evil(60) });
    if (r.status === 429) { limited = i + 1; break; }
  }
  check(limited !== null && limited <= 32, `auth rate limit kicks in (429 on request #${limited})`);

  /* ---------------------------------------------------------------- */
  section("3. Accounts, sign-in and lockout");
  const adminIp = good(20);
  const reg = await register(ADMIN_EMAIL, ADMIN_PASSWORD, adminIp, "Founder");
  check(reg.status === 201 || reg.status === 409, `register admin ${ADMIN_EMAIL} → ${reg.status}${reg.status === 409 ? " (already exists — set E2E_ADMIN_PASSWORD)" : ""}`);
  const regMember = await register(MEMBER_EMAIL, MEMBER_PASSWORD, good(21), "Member");
  check(regMember.status === 201, `register member → ${regMember.status}`);
  const memberJar = new Jar();
  const bad = await signInWith(memberJar, "credentials", { email: MEMBER_EMAIL, password: "wrong-password-xx" }, good(21));
  check(!bad.success, "wrong password is rejected");
  const okSignIn = await signInWith(memberJar, "credentials", { email: MEMBER_EMAIL, password: MEMBER_PASSWORD }, good(21));
  check(okSignIn.success, "correct password signs in (session cookie set)");
  const lockJar = new Jar();
  for (let i = 0; i < 5; i += 1) await signInWith(lockJar, "credentials", { email: MEMBER_EMAIL, password: `nope-${i}` }, good(22));
  const locked = await signInWith(lockJar, "credentials", { email: MEMBER_EMAIL, password: MEMBER_PASSWORD }, good(22));
  check(!locked.success, "account locks after 5 failed sign-ins (correct password refused)");
  const appNoSession = await req("/app/scan", { ip: good(23) });
  check(appNoSession.status === 302 || appNoSession.status === 307, `/app without a session redirects → ${appNoSession.status}`);
  const adminNoSession = await req("/admin", { ip: good(23) });
  check(adminNoSession.status === 302 || adminNoSession.status === 307, `/admin without a session redirects → ${adminNoSession.status}`);
  const adminAsMember = await req("/admin", { jar: memberJar, ip: good(21) });
  check(adminAsMember.status === 200 && adminAsMember.text.includes("Administrator access required"), "a normal member sees only the access-denied card on /admin");
  const trustAsMember = await req("/api/admin/trust", { method: "POST", jar: memberJar, ip: good(21), headers: { origin: base } });
  check(trustAsMember.status === 403, `member cannot mint a trusted-browser cookie → ${trustAsMember.status}`);

  /* ---------------------------------------------------------------- */
  section("4. Emergency door — get back in from a banned address");
  const emJar = new Jar();
  const emBad = await req("/api/emergency/login", { method: "POST", ip: attacker, jar: emJar, json: { email: ADMIN_EMAIL, password: "definitely-wrong", key: "" } });
  check(emBad.status === 403 && !emJar.has("clyvro_trust"), `wrong password → ${emBad.status}, no cookie`);
  const emMember = await req("/api/emergency/login", { method: "POST", ip: attacker, json: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD, key: "" } });
  check(emMember.status === 403 && emMember.data?.error?.message === emBad.data?.error?.message, "non-admin with a correct password gets the same generic refusal");
  const em = await req("/api/emergency/login", { method: "POST", ip: attacker, jar: emJar, json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, key: "" } });
  check(em.status === 200 && em.data?.ok === true && typeof em.data?.token === "string", `admin + correct password → ${em.status}, bridge token issued`);
  check(emJar.has("clyvro_trust"), "trusted-browser cookie set by the emergency door");
  check(em.data?.unbannedIp === true, "the banned address was un-banned");
  const bypass = await req("/pricing", { ip: attacker, jar: emJar });
  check(bypass.status === 200, `same browser now passes Shield from the (previously banned) address → ${bypass.status}`);
  const session = await signInWith(emJar, "firebase-bridge", { token: em.data?.token ?? "" }, attacker);
  check(session.success, "bridge token opens an Auth.js session");
  const adminPage = await req("/admin/security", { ip: attacker, jar: emJar });
  check(adminPage.status === 200 && adminPage.text.includes("Revoke all trusted browsers"), `/admin/security renders for the recovered admin → ${adminPage.status}`);
  // Throttle: 5 failures per address in 15 minutes.
  const throttleIp = evil(77);
  let throttled = null;
  for (let i = 0; i < 7; i += 1) {
    const r = await req("/api/emergency/login", { method: "POST", ip: throttleIp, json: { email: ADMIN_EMAIL, password: `bad-${i}`, key: "" } });
    if (r.status === 429) { throttled = i + 1; break; }
  }
  check(throttled === 6, `emergency throttle closes the door for that address after 5 failures (429 on attempt #${throttled})`);
  const otherAddress = await req("/api/emergency/login", { method: "POST", ip: evil(78), json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, key: "" } });
  const accountPathClosed = otherAddress.status === 429 && /password attempts for this account/.test(otherAddress.data?.error?.message ?? "");
  check(otherAddress.status === 200 || accountPathClosed, `…while the admin still gets in from another address → ${otherAddress.status}${accountPathClosed ? " (password path closed by repeated runs; the emergency key path stays open)" : ""}`);
  if (EMERGENCY_KEY) {
    const wrongKey = await req("/api/emergency/login", { method: "POST", ip: evil(79), json: { email: ADMIN_EMAIL, password: "", key: `${EMERGENCY_KEY}-wrong` } });
    check(wrongKey.status === 403 && !wrongKey.data?.token, `a wrong emergency key gets the same generic refusal → ${wrongKey.status}`);
    const withKey = await req("/api/emergency/login", { method: "POST", ip: evil(79), json: { email: ADMIN_EMAIL, password: "", key: EMERGENCY_KEY } });
    check(withKey.status === 200 && typeof withKey.data?.token === "string", `the emergency key alone opens the door (no password) → ${withKey.status}`);
  } else {
    log("(set E2E_EMERGENCY_KEY to the server's ADMIN_EMERGENCY_KEY to also test the key path)");
  }

  /* ---------------------------------------------------------------- */
  section("5. Trusted browsers — follow the admin, not the IP");
  const roamIp = good(199);
  const roam = await req("/admin/security", { ip: roamIp, jar: emJar });
  check(roam.status === 200, `admin session + trust cookie works from a brand-new address → ${roam.status}`);
  const trustStatus = await req("/api/admin/trust", { ip: roamIp, jar: emJar });
  check(trustStatus.data?.trusted === true && typeof trustStatus.data?.expiresAt === "string", `GET /api/admin/trust → trusted until ${trustStatus.data?.expiresAt}`);
  const csrf = await req("/api/admin/actions", { method: "POST", ip: roamIp, jar: emJar, headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }, json: { action: "shield.setMode", mode: "monitor" } });
  check(csrf.status === 403 && csrf.headers.get("x-clyvro-shield") === "blocked", `cross-site POST with the admin's cookies is blocked (CSRF guard) → ${csrf.status}`);
  // (The CSRF guard runs before the trusted-browser bypass on purpose: a CSRF victim IS a trusted browser.)
  const revoke = await req("/api/admin/actions", { method: "POST", ip: roamIp, jar: emJar, headers: { origin: base, "sec-fetch-site": "same-origin" }, json: { action: "shield.revokeTrust", confirm: true } });
  check(revoke.status === 200 && revoke.data?.settings?.trustVersion >= 2, `revoke all trusted browsers → generation ${revoke.data?.settings?.trustVersion}`);
  const afterRevoke = await req("/api/admin/trust", { ip: roamIp, jar: emJar });
  check(afterRevoke.data?.trusted === false, "old cookie no longer counts as trusted");
  const reissue = await req("/api/admin/trust", { method: "POST", ip: roamIp, jar: emJar, headers: { origin: base } });
  check(reissue.status === 200 && reissue.data?.trusted === true, "admin re-trusts the browser in one call");

  /* ---------------------------------------------------------------- */
  section("6. Cron jobs — full response capture");
  const created = await req("/api/cron-jobs", { method: "POST", ip: roamIp, jar: emJar, headers: { origin: base }, json: { name: "E2E zen", url: CRON_URL, method: "GET", intervalMinutes: 60 } });
  check(created.status === 201 && created.data?.id, `create cron job → ${created.status}`);
  const jobId = created.data?.id;
  if (jobId) {
    const run = await req(`/api/cron-jobs/${jobId}/run`, { method: "POST", ip: roamIp, jar: emJar, headers: { origin: base } });
    const r = run.data ?? {};
    check(run.status === 200 && r.ok === true, `run now → ${r.statusLine ?? run.status} in ${r.durationMs} ms`);
    const headerCount = Object.keys(r.response?.headers ?? {}).length;
    check(headerCount >= 3, `response headers captured (${headerCount})`, Object.keys(r.response?.headers ?? {}).slice(0, 6).join(", "));
    check(typeof r.response?.body === "string" && r.response.body.length > 0, "response body captured", JSON.stringify((r.response?.body ?? "").slice(0, 80)));
    log(`      ┌ ${r.statusLine}`);
    for (const [k, v] of Object.entries(r.response?.headers ?? {}).slice(0, 8)) log(`      │ ${k}: ${String(v).slice(0, 70)}`);
    log(`      └ body: ${JSON.stringify((r.response?.body ?? "").slice(0, 120))}`);
    const runs = await req(`/api/cron-jobs/${jobId}/runs`, { ip: roamIp, jar: emJar });
    const first = runs.data?.runs?.[0];
    check(first && first.responseBody && first.responseHeaders && first.trigger === "manual", "run history stores body, headers and trigger");
    const list = await req("/api/cron-jobs", { ip: roamIp, jar: emJar });
    const item = list.data?.jobs?.find((j) => j.job.id === jobId);
    check(item && item.job.lastStatus === r.status && item.job.lastDurationMs !== null, "job summary shows last status + duration");
    const del = await req(`/api/cron-jobs/${jobId}`, { method: "DELETE", ip: roamIp, jar: emJar, headers: { origin: base } });
    check(del.status === 200, "delete the test job");
  }

  /* ---------------------------------------------------------------- */
  if (process.env.E2E_SKIP_SCAN === "1") {
    section("7. Public scan — skipped (E2E_SKIP_SCAN=1)");
  } else {
    section(`7. Public scan of ${SCAN_URL}`);
    const scanIp = good(77);
    const scanDevice = `e2e-scan-${Date.now().toString(36)}`;
    let token = null;
    let slices = 0;
    let report = null;
    const started = Date.now();
    while (Date.now() - started < 240_000) {
      const r = await req("/api/scan", { method: "POST", ip: scanIp, headers: { "x-clyvro-device": scanDevice }, json: token ? { resumeToken: token } : { url: SCAN_URL, locale: "en" } });
      if (r.status !== 200 && r.status !== 202) { fail(`scan request → ${r.status}`, r.data?.error?.message ?? r.text.slice(0, 120)); break; }
      if (r.data?.status === "processing") { token = r.data.resumeToken; slices += 1; continue; }
      report = r.data; break;
    }
    if (report) {
      check(["completed", "partial"].includes(report.status), `scan ${report.status} after ${slices + 1} request(s) in ${Math.round((Date.now() - started) / 1000)} s`);
      check(typeof report.score === "number" && Array.isArray(report.findings), `score ${report.score}/100 · ${report.findings?.length} findings · ${report.coverage?.pagesParsed} pages parsed`);
      for (const f of (report.findings ?? []).slice(0, 5)) log(`      • [${f.severity ?? f.impact ?? "?"}] ${f.title ?? f.ruleId ?? ""}`);
    }
    const second = await req("/api/scan", { method: "POST", ip: scanIp, headers: { "x-clyvro-device": scanDevice }, json: { url: SCAN_URL, locale: "en" } });
    check(second.status === 403 && second.data?.error?.code === "FREE_SCAN_USED", `second anonymous scan from the same device is refused (${second.data?.error?.code})`);
    const ssrf = await req("/api/scan", { method: "POST", ip: good(78), headers: { "x-clyvro-device": "e2e-ssrf" }, json: { url: "http://127.0.0.1:3111/admin", locale: "en" } });
    check(ssrf.status >= 400 && ssrf.status < 500, `scanning a private address is refused → ${ssrf.status} ${ssrf.data?.error?.code ?? ""}`);
  }

  /* ---------------------------------------------------------------- */
  section("8. Deep Scan, Full Scan, Flow Scan, Site API (no long Playwright wait)");
  const docsApi = await req("/docs/api", { ip: good(80) });
  check(docsApi.status === 200 && /Site API/i.test(docsApi.text), `GET /docs/api → ${docsApi.status}`);
  const guardNoKey = await req("/api/v1/guard", { method: "POST", ip: good(80), json: { method: "GET", path: "/", search: "", userAgent: "Mozilla/5.0" } });
  check(guardNoKey.status === 401, `Site Guard without a key → ${guardNoKey.status} ${guardNoKey.data?.error?.code ?? ""}`);
  const fullAnon = await req("/api/full-scans", { method: "POST", ip: good(80), json: { url: SCAN_URL } });
  check(fullAnon.status === 401 || fullAnon.status === 403, `Full Scan without a session → ${fullAnon.status}`);
  const roamMember = good(81);
  const fullFree = await req("/api/full-scans", { method: "POST", ip: roamMember, jar: memberJar, headers: { origin: base }, json: { url: SCAN_URL } });
  check(fullFree.status === 403 && fullFree.data?.error?.code === "PLAN_LIMIT", `Full Scan on Free is refused (${fullFree.data?.error?.code ?? fullFree.status}) — Pro/Agency only`);
  const flowCreate = await req("/api/flow-scans", { method: "POST", ip: roamMember, jar: memberJar, headers: { origin: base }, json: { url: SCAN_URL } });
  check(flowCreate.status === 201 && typeof flowCreate.data?.id === "string", `Flow Scan queues a real run → ${flowCreate.status} id=${flowCreate.data?.id ?? "?"}`);
  if (flowCreate.data?.id) {
    const flowGet = await req(`/api/flow-scans/${flowCreate.data.id}`, { ip: roamMember, jar: memberJar });
    check(flowGet.status === 200 && ["queued", "running", "failed", "completed"].includes(flowGet.data?.scan?.status), `Flow Scan row is pollable (${flowGet.data?.scan?.status}) — browser picture streams on steps[].preview`);
  }
  const deep = await req("/api/audits", { method: "POST", ip: roamMember, jar: memberJar, headers: { origin: base }, json: { url: SCAN_URL, mode: "deep", consent: true } });
  check(deep.status === 202 || (deep.status === 403 && ["PLAN_LIMIT", "DOMAIN_NOT_VERIFIED", "CONSENT_REQUIRED"].includes(deep.data?.error?.code)), `Deep Scan is a real engine call → ${deep.status} ${deep.data?.error?.code ?? deep.data?.auditId ?? ""}`);
  if (deep.data?.auditId) {
    const detail = await req(`/api/audits/${deep.data.auditId}`, { ip: roamMember, jar: memberJar });
    check(detail.status === 200 && detail.data?.audit?.scanMode === "deep", `Deep Scan audit is pollable (mode=${detail.data?.audit?.scanMode}, status=${detail.data?.audit?.status})`);
  }

  /* ---------------------------------------------------------------- */
  section("Summary");
  const passed = results.filter((r) => r.ok).length;
  log(`${passed}/${results.length} checks passed in ${Math.round((Date.now() - t0) / 1000)} s${failures ? ` — ${failures} FAILED` : ""}`);
  if (!process.env.E2E_ADMIN_PASSWORD) log(`(admin password used for this run: ${ADMIN_PASSWORD})`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { log(`fatal: ${err?.stack ?? err}`); process.exit(2); });
