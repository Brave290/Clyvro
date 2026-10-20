import { promises as dns } from "node:dns";
import { assertPublicUrl, type Resolver } from "@/lib/scanner/ssrf";
import { fetchPublic, undiciTransport, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { parseRobots, robotsAllows } from "@/lib/scanner/crawl";
import { getTlsCertInfo } from "@/lib/services/readiness";
import { ScanError } from "@/lib/scanner/types";

/**
 * Developer Tools (Beta) — five small, sharp utilities developers reach
 * for daily, all built on Clyvro's existing SSRF-safe plumbing:
 *   ssl        — TLS certificate inspector (issuer, expiry, countdown)
 *   dns        — DNS records inspector (A/AAAA/CNAME/NS/MX/TXT + SPF/DMARC)
 *   redirects  — redirect chain tracer (hop-by-hop, every hop revalidated)
 *   headers    — response headers debugger (security set, cookies, timing)
 *   robots     — robots.txt + sitemap tester (is a path crawlable?)
 * Results are facts only: whatever DNS, the certificate, or the live
 * response actually said. Bounded everywhere; public targets only.
 */

export type DevToolId = "ssl" | "dns" | "redirects" | "headers" | "robots";
export const DEV_TOOL_IDS: DevToolId[] = ["ssl", "dns", "redirects", "headers", "robots"];

export interface DevFact { label: string; value: string; status?: "pass" | "warn" | "fail" | "info" }
export interface DevToolResult {
  tool: DevToolId;
  target: string;
  facts: DevFact[];
  sections: { title: string; items: string[] }[];
}

function hostOf(input: string): { url: URL; host: string; apex: string } {
  const normalized = normalizeScanInput(input.trim());
  const url = new URL(normalized);
  return { url, host: url.hostname, apex: url.hostname.replace(/^www\./, "") };
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]).catch(() => fallback);
}

/* ---------------- SSL certificate monitor ---------------- */

export async function sslTool(input: string, deps: { resolver?: Resolver } = {}): Promise<DevToolResult> {
  const { host, apex } = hostOf(input);
  const target = await assertPublicUrl(`https://${host}`, deps.resolver);
  const ip = target.ips[0];
  if (!ip) throw new ScanError("FETCH_FAILED", "That domain didn't resolve to a public address.");
  const cert = await getTlsCertInfo(ip, host);
  if (!cert) throw new ScanError("FETCH_FAILED", "We couldn't read a TLS certificate for that host (the HTTPS handshake may be blocked or unavailable).");
  const facts: DevFact[] = [
    { label: "Issuer", value: cert.issuer ?? "Unknown", status: "info" },
    { label: "Subject (CN)", value: cert.subject ?? host, status: "info" },
    { label: "Valid from", value: cert.validFrom ?? "Unknown", status: "info" },
    { label: "Expires", value: cert.validTo ?? "Unknown", status: cert.daysLeft !== null && cert.daysLeft > 30 ? "pass" : cert.daysLeft !== null && cert.daysLeft > 7 ? "warn" : "fail" },
    {
      label: "Days remaining", value: cert.daysLeft !== null ? `${cert.daysLeft} days` : "Unknown",
      status: cert.daysLeft !== null && cert.daysLeft > 30 ? "pass" : cert.daysLeft !== null && cert.daysLeft > 7 ? "warn" : "fail",
    },
    { label: "Connected to", value: ip, status: "info" },
  ];
  const sections = [{
    title: "What to do",
    items: cert.daysLeft !== null && cert.daysLeft <= 30
      ? ["Renew now — most hosts (Vercel, Netlify, Cloudflare, Let's Encrypt) auto-renew; a low day-count means auto-renewal may be broken.", "After renewing, re-run this check to confirm the new expiry date, then set a calendar reminder 30 days before the next one."]
      : ["Nothing urgent. Set a recurring reminder 30 days before expiry — an expired certificate takes the whole site down for every visitor.", "Check that auto-renewal is enabled at your host so this never becomes an emergency."],
  }];
  return { tool: "ssl", target: apex, facts, sections };
}

/* ---------------- DNS records inspector ---------------- */

export async function dnsTool(input: string): Promise<DevToolResult> {
  const { apex } = hostOf(input);
  const [a, aaaa, cname, ns, mx, txt, caa] = await Promise.all([
    withTimeout(dns.resolve4(apex), 4000, [] as string[]),
    withTimeout(dns.resolve6(apex), 4000, [] as string[]),
    withTimeout(dns.resolveCname(apex), 4000, [] as string[]),
    withTimeout(dns.resolveNs(apex), 4000, [] as string[]),
    withTimeout(dns.resolveMx(apex), 4000, [] as { exchange: string; priority: number }[]),
    withTimeout(dns.resolveTxt(apex), 4000, [] as string[][]),
    withTimeout(dns.resolveCaa(apex).catch(() => []), 4000, [] as { critical: number; issue?: string; issuewild?: string; iodef?: string }[]),
  ]);
  const flatTxt = txt.map((parts) => parts.join(""));
  const spf = flatTxt.find((t) => t.startsWith("v=spf1"));
  const dmarcRows = await withTimeout(dns.resolveTxt(`_dmarc.${apex}`), 4000, [] as string[][]);
  const dmarc = dmarcRows.map((p) => p.join("")).find((t) => t.startsWith("v=DMARC1"));
  const facts: DevFact[] = [
    { label: "A (IPv4)", value: a.length ? a.join(", ") : "None", status: a.length ? "pass" : "warn" },
    { label: "AAAA (IPv6)", value: aaaa.length ? aaaa.join(", ") : "None", status: aaaa.length ? "pass" : "info" },
    { label: "CNAME", value: cname.length ? cname.join(", ") : "None (A/AAAA direct)", status: "info" },
    { label: "Nameservers", value: ns.length ? `${ns.length}: ${ns.slice(0, 3).join(", ")}` : "None found", status: ns.length >= 2 ? "pass" : "warn" },
    { label: "MX (mail)", value: mx.length ? mx.map((m) => `${m.exchange} (p${m.priority})`).join(", ") : "None — domain can't receive email", status: mx.length ? "pass" : "info" },
    { label: "SPF", value: spf ? spf.slice(0, 120) : "Missing", status: spf ? "pass" : mx.length ? "warn" : "info" },
    { label: "DMARC", value: dmarc ? dmarc.slice(0, 120) : "Missing", status: dmarc ? "pass" : mx.length ? "warn" : "info" },
    {
      label: "CAA (who may issue certificates)",
      value: caa.length ? caa.map((r) => r.issue ?? r.issuewild ?? r.iodef ?? "").filter(Boolean).join(", ") : "Not set — any CA may issue for this domain",
      status: caa.length ? "pass" : "info",
    },
  ];
  const sections = [
    { title: "TXT records", items: flatTxt.length ? flatTxt.map((t) => t.slice(0, 200)) : ["No TXT records at the apex."] },
    {
      title: "What to do",
      items: [
        ...(mx.length && !spf ? ["Add an SPF TXT record listing your mail senders — without it, anyone can spoof mail from your domain."] : []),
        ...(mx.length && !dmarc ? ["Add a DMARC record at _dmarc (start with p=none to monitor, then move to quarantine/reject)."] : []),
        ...(ns.length < 2 ? ["Use at least two nameservers so DNS survives one provider failing."] : []),
        "DNS changes propagate over minutes-to-hours depending on TTL — re-run this inspector to confirm a change is live worldwide-ish (this lookup) before debugging your app.",
      ],
    },
  ];
  return { tool: "dns", target: apex, facts, sections };
}

/* ---------------- Redirect chain tracer ---------------- */

export async function redirectsTool(input: string, deps: { resolver?: Resolver; transport?: Transport } = {}): Promise<DevToolResult> {
  const { url } = hostOf(input);
  const transport = deps.transport ?? undiciTransport;
  const hops: { url: string; status: number; location: string | null; ms: number }[] = [];
  let current = url;
  for (let i = 0; i < 10; i++) {
    const target = await assertPublicUrl(current, deps.resolver);
    const started = Date.now();
    const raw = await transport(target, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "ClyvroDevTools/1.0 (+https://clyvro.vercel.app)" },
      method: "GET",
    });
    const location = raw.header("location");
    const status = raw.status;
    await raw.cancelBody().catch(() => undefined);
    hops.push({ url: current.href, status, location, ms: Date.now() - started });
    if (![301, 302, 303, 307, 308].includes(status) || !location) break;
    current = new URL(location, current);
    if (i === 9) hops.push({ url: current.href, status: 0, location: null, ms: 0 });
  }
  const facts: DevFact[] = [
    { label: "Hops", value: `${hops.length}`, status: hops.length <= 2 ? "pass" : hops.length <= 4 ? "warn" : "fail" },
    { label: "Final URL", value: hops[hops.length - 1]?.url ?? url.href, status: "info" },
    { label: "Final status", value: `${hops[hops.length - 1]?.status ?? "—"}`, status: (hops[hops.length - 1]?.status ?? 0) >= 200 && (hops[hops.length - 1]?.status ?? 0) < 300 ? "pass" : "warn" },
    { label: "Total time", value: `${hops.reduce((n, h) => n + h.ms, 0)}ms (sum of hops)`, status: "info" },
    { label: "Upgrades to HTTPS", value: url.protocol === "https:" ? "Started on HTTPS" : hops.some((h) => h.url.startsWith("https://")) ? "Yes" : "No — stays on HTTP", status: url.protocol === "https:" || hops.some((h) => h.url.startsWith("https://")) ? "pass" : "fail" },
  ];
  const sections = [{
    title: "The chain",
    items: hops.map((h, i) => `${i + 1}. ${h.url} → HTTP ${h.status || "…"}${h.location ? ` → ${h.location}` : ""} (${h.ms}ms)`),
  }, {
    title: "What to do",
    items: hops.length > 2
      ? ["Collapse the chain: point the first URL straight at the final destination. Every hop costs a full round-trip and leaks link equity in SEO.", "Use 301 (permanent) for moved pages so search engines transfer ranking; reserve 302 for genuinely temporary moves."]
      : ["This chain is tight. Keep it that way — audit it again after any domain or platform migration."],
  }];
  return { tool: "redirects", target: url.href, facts, sections };
}

/* ---------------- Response headers debugger ---------------- */

const SECURITY_HEADERS = [
  "strict-transport-security", "content-security-policy", "x-content-type-options",
  "x-frame-options", "referrer-policy", "permissions-policy",
] as const;

export async function headersTool(input: string, deps: { resolver?: Resolver; transport?: Transport } = {}): Promise<DevToolResult> {
  const { url } = hostOf(input);
  const outcome = await fetchPublic(url, {
    maxBytes: 200_000, resolver: deps.resolver, transport: deps.transport,
    userAgent: "ClyvroDevTools/1.0 (+https://clyvro.vercel.app)",
  });
  const headers = outcome.headers ?? {};
  const present = SECURITY_HEADERS.filter((h) => headers[h]);
  const facts: DevFact[] = [
    { label: "Final URL", value: outcome.finalUrl, status: "info" },
    { label: "Status", value: `HTTP ${outcome.status}`, status: outcome.status >= 200 && outcome.status < 300 ? "pass" : "warn" },
    { label: "Response time", value: `${outcome.durationMs}ms (this fetch, headers+body sample)`, status: outcome.durationMs < 1000 ? "pass" : outcome.durationMs < 3000 ? "warn" : "fail" },
    { label: "Content-Type", value: outcome.contentType ?? "Unknown", status: "info" },
    { label: "Security headers", value: `${present.length}/${SECURITY_HEADERS.length} present`, status: present.length === SECURITY_HEADERS.length ? "pass" : present.length >= 3 ? "warn" : "fail" },
    { label: "Cookies set", value: outcome.cookieFlags?.length ? outcome.cookieFlags.map((c) => `${c.name}${c.secure ? " Secure" : ""}${c.httpOnly ? " HttpOnly" : ""}`).join("; ") : "None on this response", status: "info" },
    {
      label: "Cookie hardening",
      value: outcome.cookieFlags?.length
        ? `${outcome.cookieFlags.filter((c) => c.secure && c.httpOnly).length}/${outcome.cookieFlags.length} cookies are Secure + HttpOnly`
        : "No cookies to assess",
      status: !outcome.cookieFlags?.length ? "info" : outcome.cookieFlags.every((c) => c.secure && c.httpOnly) ? "pass" : "warn",
    },
    { label: "Redirects followed", value: `${outcome.redirectChain.length}`, status: outcome.redirectChain.length <= 1 ? "pass" : "warn" },
  ];
  const sections = [
    { title: "Security header detail", items: SECURITY_HEADERS.map((h) => `${headers[h] ? "✓" : "✗"} ${h}${headers[h] ? `: ${headers[h].slice(0, 120)}` : " — missing"}`) },
    { title: "All captured headers", items: Object.entries(headers).map(([k, v]) => `${k}: ${v.slice(0, 160)}`) },
    ...(outcome.redirectChain.length ? [{ title: "Redirect chain", items: outcome.redirectChain }] : []),
    {
      title: "What to do",
      items: present.length === SECURITY_HEADERS.length
        ? ["Full house. Re-check after platform or framework migrations — headers are often lost in deploys."]
        : ["Add the missing headers at your framework/CDN layer (in Next.js: next.config headers()). Start with nosniff + frame protection, then a CSP in report-only mode."],
    },
  ];
  return { tool: "headers", target: outcome.finalUrl, facts, sections };
}

/* ---------------- robots.txt + sitemap tester ---------------- */

export async function robotsTool(input: string, testPath = "/", deps: { resolver?: Resolver; transport?: Transport } = {}): Promise<DevToolResult> {
  const { url, host } = hostOf(input);
  const fetchOpts = { resolver: deps.resolver, transport: deps.transport, allowNonHtmlBody: true, userAgent: "ClyvroDevTools/1.0 (+https://clyvro.vercel.app)" };
  const [robotsRes, sitemapRes] = await Promise.all([
    fetchPublic(new URL(`https://${host}/robots.txt`), { ...fetchOpts, maxBytes: 100_000 }).catch(() => null),
    fetchPublic(new URL(`https://${host}/sitemap.xml`), { ...fetchOpts, maxBytes: 300_000 }).catch(() => null),
  ]);
  const robotsText = robotsRes?.bodyText ?? "";
  const groups = robotsText ? parseRobots(robotsText) : [];
  const path = testPath.startsWith("/") ? testPath : `/${testPath}`;
  const allowed = robotsText ? robotsAllows(groups, path) : true;
  const sitemapBody = sitemapRes?.bodyText ?? "";
  const sitemapUrls = (sitemapBody.match(/<loc>/gi) ?? []).length;
  const sitemapRefs = [...robotsText.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const facts: DevFact[] = [
    { label: "robots.txt", value: robotsRes ? `HTTP ${robotsRes.status}` : "Unreachable", status: robotsRes && robotsRes.status < 300 ? "pass" : "warn" },
    { label: `Is ${path} crawlable?`, value: !robotsText ? "No robots.txt — everything public is crawlable" : allowed ? "Allowed for all crawlers (User-agent: * rules)" : "BLOCKED by robots.txt", status: allowed ? "pass" : "fail" },
    { label: "Rule groups", value: `${groups.length}`, status: "info" },
    { label: "sitemap.xml", value: sitemapRes ? `HTTP ${sitemapRes.status}${sitemapUrls ? ` · ${sitemapUrls} URL(s)` : ""}` : "Unreachable", status: sitemapRes && sitemapRes.status < 300 && sitemapUrls > 0 ? "pass" : "warn" },
    { label: "Sitemap referenced in robots.txt", value: sitemapRefs.length ? sitemapRefs.join(", ") : "No", status: sitemapRefs.length ? "pass" : "info" },
  ];
  const sections = [
    { title: "robots.txt content", items: robotsText ? robotsText.split("\n").filter((l) => l.trim()).slice(0, 40) : ["(empty or missing — crawlers will crawl everything public)"] },
    {
      title: "What to do",
      items: [
        ...(!allowed ? [`${path} is blocked. If that's a mistake, edit robots.txt — a stray "Disallow: /" during development is the classic cause of disappearing from Google.`] : []),
        ...(sitemapUrls === 0 ? ["Publish a valid /sitemap.xml and reference it with a Sitemap: line in robots.txt so crawlers find pages without guessing."] : []),
        "Re-test key paths after every robots change (homepage, pricing, sign-in exclusions are intentional; product pages rarely should be blocked).",
      ],
    },
  ];
  void url;
  return { tool: "robots", target: host, facts, sections };
}

export async function runDevTool(tool: DevToolId, target: string, testPath?: string): Promise<DevToolResult> {
  switch (tool) {
    case "ssl": return sslTool(target);
    case "dns": return dnsTool(target);
    case "redirects": return redirectsTool(target);
    case "headers": return headersTool(target);
    case "robots": return robotsTool(target, testPath || "/");
    default: throw new ScanError("VALIDATION", "Unknown developer tool.");
  }
}
