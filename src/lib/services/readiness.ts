import { promises as dns } from "node:dns";
import { connect as tlsConnect } from "node:tls";
import { desc, eq, and, asc } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { organizations, readinessChecks } from "@/lib/db/schema";
import {effectivePlanForOrg, } from "@/lib/plans";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";
import { detectTechnology, type DetectedTech } from "@/lib/tech-detection";

/**
 * Project Readiness: a super-strict, deterministic profile of a domain —
 * stack & framework fingerprints, hosting/DNS, domain registration
 * (RDAP), TLS, security headers, and email authentication. Every line
 * is sourced from DNS, the certificate, RDAP, response headers, or the
 * served HTML. There is no "deployment date" guesswork: only real,
 * labelled dates (domain registration, certificate issuance).
 */

export type ReadinessStatus = "pass" | "warn" | "fail" | "info";
export interface ReadinessCheck {
  id: string;
  group: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
}
export interface ReadinessReport {
  domain: string;
  finalUrl: string | null;
  tier: "basic" | "full";
  checks: ReadinessCheck[];
  tech: DetectedTech[];
  facts: { label: string; value: string }[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

const TRIAL_MS = 24 * 60 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]).catch(() => fallback);
}

/**
 * Backwards-compatible wrapper around the shared detector. The scanner and
 * Readiness now use the same fingerprint catalogue, so a stack visible to
 * one is visible to both.
 */
export function detectTech(html: string, headers: Record<string, string>): DetectedTech[] {
  return detectTechnology({ html, headers });
}

function primaryHosting(tech: DetectedTech[]): string | null {
  const platforms = tech.filter((t) => t.category === "platform");
  const hosting = platforms.find((t) => !/cloudflare dns|cdn|waf|cloudfront|fastly|akamai/i.test(t.name));
  if (hosting) return hosting.confidence === "inferred" ? `${hosting.name} (by IP range)` : hosting.name;
  return platforms[0]?.name ?? null;
}

interface RdapInfo { registrar: string | null; created: string | null; expires: string | null; statuses: string[] }
async function rdapLookup(domain: string): Promise<RdapInfo | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const events = (data.events as { eventAction?: string; eventDate?: string }[] | undefined) ?? [];
    const entities = (data.entities as Record<string, unknown>[] | undefined) ?? [];
    let registrar: string | null = null;
    for (const e of entities) {
      const roles = (e.roles as string[] | undefined) ?? [];
      if (!roles.includes("registrar")) continue;
      const vcard = (e.vcardArray as unknown[] | undefined)?.[1] as unknown[][] | undefined;
      const fn = vcard?.find((row) => row[0] === "fn")?.[3];
      if (typeof fn === "string") registrar = fn;
    }
    return {
      registrar,
      created: events.find((e) => e.eventAction === "registration")?.eventDate ?? null,
      expires: events.find((e) => e.eventAction === "expiration")?.eventDate ?? null,
      statuses: ((data.status as string[] | undefined) ?? []).slice(0, 5),
    };
  } catch {
    return null;
  }
}

export interface CertInfo { issuer: string | null; validFrom: string | null; validTo: string | null; daysLeft: number | null; subject: string | null }

/** TLS certificate details for a public host (used by Readiness + the SSL Monitor dev tool). */
export function getTlsCertInfo(ip: string, servername: string): Promise<CertInfo | null> {
  return tlsCert(ip, servername);
}
function tlsCert(ip: string, servername: string): Promise<CertInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: CertInfo | null) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const socket = tlsConnect({ host: ip, port: 443, servername, timeout: 6000, rejectUnauthorized: false }, () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          if (!cert || !cert.valid_to) return done(null);
          const to = new Date(cert.valid_to);
          const one = (v: string | string[] | undefined): string | null =>
            Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
          done({
            issuer: one(cert.issuer?.O) ?? one(cert.issuer?.CN),
            validFrom: cert.valid_from ?? null,
            validTo: cert.valid_to ?? null,
            daysLeft: Math.floor((to.getTime() - Date.now()) / 86_400_000),
            subject: one(cert.subject?.CN),
          });
        } catch { done(null); }
      });
      socket.on("error", () => done(null));
      socket.on("timeout", () => { socket.destroy(); done(null); });
    } catch { done(null); }
  });
}

export async function runReadinessEngine(
  domainInput: string,
  tier: "basic" | "full",
  deps: { transport?: Transport } = {},
): Promise<ReadinessReport> {
  const normalized = normalizeScanInput(domainInput.trim());
  const target = await assertPublicUrl(normalized);
  const host = target.url.hostname;
  const apex = host.replace(/^www\./, "");
  const fetchOpts = { timeoutMs: 7000, transport: deps.transport, userAgent: "ClyvroReadiness/1.0 (+https://clyvro.vercel.app)" };

  const [main, httpVersion, wwwVersion, sitemapRes, robotsRes, notFoundRes, aRecs, aaaaRecs, nsRecs, mxRecs, cnameRecs, rdap, cert] = await Promise.all([
    fetchPublic(new URL(`https://${host}`), { ...fetchOpts, maxBytes: 600_000 }).catch(() => null),
    fetchPublic(new URL(`http://${host}`), { ...fetchOpts, headersOnly: true }).catch(() => null),
    host === apex ? fetchPublic(new URL(`https://www.${apex}`), { ...fetchOpts, headersOnly: true }).catch(() => null) : Promise.resolve(null),
    fetchPublic(new URL(`https://${host}/sitemap.xml`), { ...fetchOpts, headersOnly: true, allowNonHtmlBody: true }).catch(() => null),
    fetchPublic(new URL(`https://${host}/robots.txt`), { ...fetchOpts, headersOnly: true, allowNonHtmlBody: true }).catch(() => null),
    fetchPublic(new URL(`https://${host}/clyvro-readiness-404-probe`), { ...fetchOpts, headersOnly: true }).catch(() => null),
    withTimeout(dns.resolve4(host), 3500, [] as string[]),
    withTimeout(dns.resolve6(host), 3500, [] as string[]),
    withTimeout(dns.resolveNs(apex), 3500, [] as string[]),
    withTimeout(dns.resolveMx(apex), 3500, [] as { exchange: string; priority: number }[]),
    withTimeout(dns.resolveCname(host), 3500, [] as string[]),
    rdapLookup(apex),
    target.ips[0] ? tlsCert(target.ips[0], host) : Promise.resolve(null),
  ]);

  const checks: ReadinessCheck[] = [];
  const add = (id: string, group: string, label: string, status: ReadinessStatus, detail: string) =>
    checks.push({ id, group, label, status, detail });
  const headers = main?.headers ?? {};
  const html = main?.bodyText ?? "";

  // Reachability & transport
  add("reachable", "Basics", "Website answers over HTTPS",
    main && main.status >= 200 && main.status < 300 ? "pass" : "fail",
    main ? `Final response HTTP ${main.status} at ${main.finalUrl} (${(main.durationMs / 1000).toFixed(1)}s).` : "No HTTPS response could be obtained.");
  const httpRedirects = httpVersion ? httpVersion.finalUrl.startsWith("https://") : false;
  add("http-redirect", "Basics", "HTTP redirects to HTTPS",
    httpRedirects ? "pass" : "warn",
    httpVersion ? (httpRedirects ? `http://${host} ends at ${httpVersion.finalUrl}.` : `http://${host} answered HTTP ${httpVersion.status} without upgrading to HTTPS.`) : "The plain-HTTP version didn't answer (may be blocked entirely — acceptable).");
  if (wwwVersion) {
    const wwwOk = wwwVersion.finalUrl.replace(/^https:\/\//, "").startsWith(apex) || (wwwVersion.status >= 200 && wwwVersion.status < 300);
    add("www-consistency", "Basics", "www and non-www agree",
      wwwOk ? "pass" : "warn",
      `https://www.${apex} → HTTP ${wwwVersion.status}, final ${wwwVersion.finalUrl}. One canonical host avoids duplicate-content split.`);
  }
  if (cert) {
    add("tls-expiry", "Security", "TLS certificate validity",
      cert.daysLeft !== null && cert.daysLeft > 30 ? "pass" : cert.daysLeft !== null && cert.daysLeft > 7 ? "warn" : "fail",
      `Issued by ${cert.issuer ?? "unknown CA"}; expires ${cert.validTo} (${cert.daysLeft} days left).`);
  } else {
    add("tls-expiry", "Security", "TLS certificate validity", "info", "Certificate details couldn't be read (the HTTPS fetch itself is covered by the reachability check).");
  }

  // Security headers
  const hdr = (id: string, label: string, name: string, advice: string) =>
    add(id, "Security", label, headers[name] ? "pass" : "warn", headers[name] ? `Present: ${headers[name].slice(0, 120)}` : `Missing — ${advice}`);
  hdr("hsts", "HSTS (force HTTPS)", "strict-transport-security", "add Strict-Transport-Security so browsers never downgrade to HTTP.");
  hdr("nosniff", "X-Content-Type-Options", "x-content-type-options", "add `nosniff` so browsers don't guess file types.");
  add("frame-protection", "Security", "Clickjacking protection (frame-ancestors / X-Frame-Options)",
    headers["x-frame-options"] || /frame-ancestors/i.test(headers["content-security-policy"] ?? "") ? "pass" : "warn",
    headers["x-frame-options"] ? `X-Frame-Options: ${headers["x-frame-options"]}` : "No X-Frame-Options and no CSP frame-ancestors — other sites can embed yours in an iframe.");
  hdr("referrer-policy", "Referrer-Policy", "referrer-policy", "set a Referrer-Policy (e.g. strict-origin-when-cross-origin) to limit URL leakage.");
  if (tier === "full") {
    hdr("csp", "Content-Security-Policy", "content-security-policy", "a CSP is the strongest XSS seatbelt; start with default-src 'self' and iterate.");
    hdr("permissions-policy", "Permissions-Policy", "permissions-policy", "declare which browser features (camera, mic, geo) the site may use.");
  }

  // Discoverability housekeeping
  add("sitemap", "SEO basics", "sitemap.xml present",
    sitemapRes && sitemapRes.status >= 200 && sitemapRes.status < 300 ? "pass" : "warn",
    sitemapRes ? `/sitemap.xml answered HTTP ${sitemapRes.status}.` : "/sitemap.xml didn't answer.");
  add("robots", "SEO basics", "robots.txt present",
    robotsRes && robotsRes.status >= 200 && robotsRes.status < 300 ? "pass" : "info",
    robotsRes ? `/robots.txt answered HTTP ${robotsRes.status}.` : "/robots.txt didn't answer (optional, but recommended).");
  add("favicon", "SEO basics", "Favicon declared",
    /rel="(shortcut )?icon"|rel="apple-touch-icon"/i.test(html) ? "pass" : "warn",
    "Checked the homepage <head> for an icon link.");
  add("custom-404", "Basics", "Missing pages return a real 404",
    notFoundRes ? (notFoundRes.status === 404 ? "pass" : "warn") : "info",
    notFoundRes ? `A deliberately wrong URL answered HTTP ${notFoundRes.status}${notFoundRes.status === 200 ? " — that's a soft-404, which confuses search engines." : "."}` : "Probe didn't answer.");

  // Domain & registration
  if (rdap) {
    const days = rdap.expires ? Math.floor((Date.parse(rdap.expires) - Date.now()) / 86_400_000) : null;
    add("domain-expiry", "Domain", "Domain registration runway",
      days === null ? "info" : days > 90 ? "pass" : days > 30 ? "warn" : "fail",
      `Registered ${rdap.created ?? "date unknown"}${rdap.registrar ? ` via ${rdap.registrar}` : ""}; expires ${rdap.expires ?? "unknown"}${days !== null ? ` (${days} days left)` : ""}.`);
    if (rdap.statuses.length) add("domain-status", "Domain", "Domain status flags", "info", rdap.statuses.join(", "));
  } else {
    add("domain-expiry", "Domain", "Domain registration runway", "info", "RDAP registration lookup was unavailable from here — re-check later.");
  }
  add("dns-ns", "Domain", "At least two nameservers",
    nsRecs.length >= 2 ? "pass" : nsRecs.length === 1 ? "warn" : "info",
    nsRecs.length ? `${nsRecs.length} nameservers: ${nsRecs.slice(0, 4).join(", ")}.` : "Nameserver lookup unavailable.");
  if (tier === "full") {
    add("ipv6", "Domain", "IPv6 (AAAA) published", aaaaRecs.length ? "pass" : "info",
      aaaaRecs.length ? `${aaaaRecs.length} IPv6 address(es).` : "No AAAA record — IPv6-only visitors/proxies can't connect directly.");
  }

  // Email authentication (full tier deep; basic gets MX presence)
  add("mx", "Email", "Email (MX) records present", mxRecs.length ? "pass" : "info",
    mxRecs.length ? `Mail handled by ${mxRecs.slice(0, 3).map((m) => m.exchange).join(", ")}.` : "No MX records — this domain can't receive email (fine if intentional).");
  if (tier === "full" && mxRecs.length) {
    const [txt, dmarc, dkimGoogle, dkimS1, dkimDefault] = await Promise.all([
      withTimeout(dns.resolveTxt(apex), 3500, [] as string[][]),
      withTimeout(dns.resolveTxt(`_dmarc.${apex}`), 3500, [] as string[][]),
      withTimeout(dns.resolveTxt(`google._domainkey.${apex}`), 3500, [] as string[][]),
      withTimeout(dns.resolveTxt(`selector1._domainkey.${apex}`), 3500, [] as string[][]),
      withTimeout(dns.resolveTxt(`default._domainkey.${apex}`), 3500, [] as string[][]),
    ]);
    const flat = (rows: string[][]) => rows.map((r) => r.join(""));
    const spf = flat(txt).find((t) => t.startsWith("v=spf1"));
    add("spf", "Email", "SPF record", spf ? "pass" : "warn", spf ? spf.slice(0, 160) : "No SPF — anyone can spoof mail from this domain.");
    const dm = flat(dmarc).find((t) => t.startsWith("v=DMARC1"));
    const policy = dm?.match(/p=(\w+)/)?.[1];
    add("dmarc", "Email", "DMARC policy", dm ? (policy === "reject" || policy === "quarantine" ? "pass" : "warn") : "warn",
      dm ? `${dm.slice(0, 160)}${policy === "none" ? " — monitoring only; move to quarantine/reject when ready." : ""}` : "No DMARC — spoofed mail won't be policed by receivers.");
    const dkimFound = [dkimGoogle, dkimS1, dkimDefault].some((r) => flat(r).some((t) => t.includes("v=DKIM1")));
    add("dkim", "Email", "DKIM key discoverable (common selectors)", dkimFound ? "pass" : "info",
      dkimFound ? "A DKIM public key was found at a common selector." : "No DKIM at google/selector1/default selectors (may exist under another selector name).");
  }

  const tech = detectTechnology({
    html,
    headers,
    cookieNames: main?.cookieFlags?.map((c) => c.name),
    url: main?.finalUrl ?? `https://${host}`,
    hostname: host,
    contentType: main?.contentType,
    cnameTargets: cnameRecs,
    nameservers: nsRecs,
    ipAddresses: [...aRecs, ...aaaaRecs],
  });
  const facts: { label: string; value: string }[] = [];
  const hint = primaryHosting(tech);
  if (hint) facts.push({ label: "Likely hosting", value: hint });
  if (headers.server) facts.push({ label: "Web server", value: headers.server });
  if (rdap?.registrar) facts.push({ label: "Registrar", value: rdap.registrar });
  if (rdap?.created) facts.push({ label: "Domain registered", value: rdap.created.slice(0, 10) });
  if (cert?.validFrom) facts.push({ label: "Current TLS certificate issued", value: String(cert.validFrom).slice(0, 21) });
  facts.push({ label: "IP addresses (A)", value: aRecs.length ? `${aRecs.length}: ${aRecs.slice(0, 3).join(", ")}` : "none found" });
  if (main) facts.push({ label: "Homepage response time (scan)", value: `${(main.durationMs / 1000).toFixed(1)}s` });
  const namesIn = (...categories: DetectedTech["category"][]) =>
    tech.filter((t) => categories.includes(t.category)).map((t) => t.name);
  const languageNames = namesIn("language", "runtime");
  if (languageNames.length) facts.push({ label: "Languages & runtimes", value: languageNames.join(" · ") });
  const frameworkNames = namesIn("framework", "library", "css", "cms", "build");
  if (frameworkNames.length) facts.push({ label: "Frameworks & libraries", value: frameworkNames.join(" · ") });
  const platformNames = namesIn("platform");
  if (platformNames.length) facts.push({ label: "Hosting & platform signals", value: platformNames.join(" · ") });

  const scored = checks.filter((c) => c.status !== "info");
  return {
    domain: apex,
    finalUrl: main?.finalUrl ?? null,
    tier,
    checks,
    tech,
    facts,
    summary: {
      pass: scored.filter((c) => c.status === "pass").length,
      warn: scored.filter((c) => c.status === "warn").length,
      fail: scored.filter((c) => c.status === "fail").length,
      total: scored.length,
    },
  };
}

export interface ReadinessAccess {
  tier: "basic" | "full";
  planName: string;
  trial: { active: boolean; endsAt: string | null; used: boolean };
}

export async function readinessAccess(organizationId: string, dbOverride?: DB): Promise<ReadinessAccess> {
  const db = dbOverride ?? (await getDb());
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  const plan = effectivePlanForOrg(org);
  if (plan.readiness !== "trial") {
    return { tier: plan.readiness, planName: plan.name, trial: { active: false, endsAt: null, used: false } };
  }
  const [first] = await db.select({ createdAt: readinessChecks.createdAt })
    .from(readinessChecks)
    .where(eq(readinessChecks.organizationId, organizationId))
    .orderBy(asc(readinessChecks.createdAt))
    .limit(1);
  if (!first) return { tier: "basic", planName: plan.name, trial: { active: false, endsAt: null, used: false } };
  const endsAt = new Date(first.createdAt.getTime() + TRIAL_MS);
  return { tier: "basic", planName: plan.name, trial: { active: Date.now() < endsAt.getTime(), endsAt: endsAt.toISOString(), used: true } };
}

export async function runAndSaveReadiness(
  organizationId: string, userId: string, domain: string,
  deps: { transport?: Transport } = {}, dbOverride?: DB,
): Promise<{ id: string; report: ReadinessReport }> {
  const db = dbOverride ?? (await getDb());
  const access = await readinessAccess(organizationId, db);
  if (access.trial.used && !access.trial.active) {
    throw new ScanError("PLAN_LIMIT", "Your 24-hour Project Readiness trial has ended. Pro includes basic Readiness checks; Ultra Agency unlocks the full super-strict set.");
  }
  const report = await runReadinessEngine(domain, access.tier, deps);
  const id = newId();
  await db.insert(readinessChecks).values({
    id, organizationId, requestedBy: userId,
    domain: report.domain, tier: report.tier, results: report, summary: report.summary,
  });
  return { id, report };
}

export async function listReadinessChecks(organizationId: string, limit = 10, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select().from(readinessChecks)
    .where(eq(readinessChecks.organizationId, organizationId))
    .orderBy(desc(readinessChecks.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

export async function getReadinessCheck(organizationId: string, id: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(readinessChecks)
    .where(and(eq(readinessChecks.id, id), eq(readinessChecks.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Readiness check not found.");
  return row;
}
