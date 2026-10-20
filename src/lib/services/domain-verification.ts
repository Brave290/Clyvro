import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as dns } from "node:dns";
import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { domainVerifications, users } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import { enqueueUserNotification } from "./notifications";
import { fetchPublic } from "@/lib/scanner/fetcher";
import { assertPublicUrl } from "@/lib/scanner/ssrf";

/**
 * DNS TXT domain-ownership verification.
 *
 * Required before private deep scans. The user places a TXT record at
 * `_clyvro-verify.<domain>`; only the SHA-256 of the token is stored.
 * Verification is established ONLY by a server-side DNS lookup matching
 * that hash — never by a client flag — and it never weakens the scanner's
 * SSRF boundary (targets are still resolved and pinned per request).
 */

const TOKEN_PREFIX = "clyvro-verification=";
const RECORD_PREFIX = "_clyvro-verify";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHECKS = 25;
const MIN_CHECK_INTERVAL_MS = 20_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type ResolveTxtFn = (name: string) => Promise<string[][]>;
const defaultResolveTxt: ResolveTxtFn = (name) => dns.resolveTxt(name);

/** Accepts a URL or bare domain; returns the apex host (www stripped). */
export function normalizeDomain(input: string): string {
  let host = input.trim().toLowerCase();
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname.toLowerCase();
  } catch {
    throw new ScanError("VALIDATION", "Enter a domain like example.com.");
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new ScanError("VALIDATION", "Ownership verification needs a domain name, not an IP address.");
  }
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) {
    throw new ScanError("VALIDATION", "Enter a domain like example.com.");
  }
  return host;
}

export function domainOfUrl(url: string): string {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return normalizeDomain(url);
  }
}

export interface IssuedVerification {
  id: string;
  domain: string;
  recordName: string;
  /** Full TXT value to publish. Shown to the workspace owner; DNS TXT is public by design. */
  recordValue: string;
  status: string;
  expiresAt: string;
}

/**
 * Issue (or re-issue) the verification token for a domain. Re-issuing
 * replaces the previous token — there is only ever one active token per
 * organization+domain, so tokens can't accumulate.
 */
export async function issueDomainVerification(
  organizationId: string,
  userId: string,
  domainInput: string,
  dbOverride?: DB,
): Promise<IssuedVerification> {
  const db = dbOverride ?? (await getDb());
  const domain = normalizeDomain(domainInput);
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const recordName = `${RECORD_PREFIX}.${domain}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const [existing] = await db.select({ id: domainVerifications.id }).from(domainVerifications)
    .where(and(eq(domainVerifications.organizationId, organizationId), eq(domainVerifications.domain, domain)))
    .limit(1);
  const values = {
    organizationId, createdBy: userId, domain,
    tokenHash: sha256(token), recordName,
    status: "pending", attempts: 0, expiresAt, verifiedAt: null, lastCheckedAt: null,
  };
  let id: string;
  if (existing) {
    id = existing.id;
    await db.update(domainVerifications).set(values).where(eq(domainVerifications.id, id));
  } else {
    id = newId();
    await db.insert(domainVerifications).values({ id, ...values });
  }
  return { id, domain, recordName, recordValue: token, status: "pending", expiresAt: expiresAt.toISOString() };
}

export async function listDomainVerifications(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(domainVerifications)
    .where(eq(domainVerifications.organizationId, organizationId))
    .orderBy(desc(domainVerifications.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id, domain: r.domain, recordName: r.recordName, status: r.status,
    attempts: r.attempts, expiresAt: r.expiresAt.toISOString(),
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
  }));
}

/**
 * Server-side DNS check. Rate-limited per record (min interval + attempt
 * cap), scoped to the owning organization, and the ONLY path that can set
 * `verified`. A matching TXT from another org's token never verifies here
 * because the hash compared is this row's own.
 */
export async function checkDomainVerification(
  organizationId: string,
  verificationId: string,
  deps: { resolveTxt?: ResolveTxtFn; now?: () => number } = {},
  dbOverride?: DB,
): Promise<{ status: string; domain: string }> {
  const db = dbOverride ?? (await getDb());
  const resolveTxt = deps.resolveTxt ?? defaultResolveTxt;
  const nowMs = (deps.now ?? Date.now)();
  const [row] = await db.select().from(domainVerifications)
    .where(and(eq(domainVerifications.id, verificationId), eq(domainVerifications.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Verification not found.");
  if (row.status === "verified") return { status: "verified", domain: row.domain };
  if (row.expiresAt.getTime() <= nowMs) {
    await db.update(domainVerifications).set({ status: "expired" }).where(eq(domainVerifications.id, row.id));
    throw new ScanError("VALIDATION", "That verification token has expired. Issue a fresh one and update the TXT record.");
  }
  if (row.attempts >= MAX_CHECKS) {
    throw new ScanError("VALIDATION", "Too many checks for this token. Issue a fresh verification token to continue.");
  }
  if (row.lastCheckedAt && nowMs - row.lastCheckedAt.getTime() < MIN_CHECK_INTERVAL_MS) {
    throw new ScanError("VALIDATION", "DNS changes take a little while to spread. Wait a few seconds and check again.");
  }

  await db.update(domainVerifications)
    .set({ attempts: row.attempts + 1, lastCheckedAt: new Date(nowMs) })
    .where(eq(domainVerifications.id, row.id));

  let records: string[][] = [];
  try {
    records = await resolveTxt(row.recordName);
  } catch {
    records = []; // ENOTFOUND/ENODATA = record not there yet, not an error state.
  }
  const expected = Buffer.from(row.tokenHash, "hex");
  const valueMatches = (raw: string): boolean => {
    const value = raw.trim().replace(/^"|"$/g, "");
    const candidate = value.startsWith(TOKEN_PREFIX) ? value : `${TOKEN_PREFIX}${value}`;
    const digest = Buffer.from(sha256(candidate), "hex");
    return digest.length === expected.length && timingSafeEqual(digest, expected);
  };
  const flatRecords = records.flat().map((r) => r.trim()).filter(Boolean);
  let matched = flatRecords.some(valueMatches);

  // Fallback proof for people who can't edit DNS (e.g. *.vercel.app and
  // other platform subdomains, whose zone the site owner doesn't
  // control): the same token as a homepage meta tag. Fetched through
  // the SSRF-safe fetcher, HTTPS only, one bounded request.
  if (!matched) {
    try {
      const target = await assertPublicUrl(`https://${row.domain}`);
      const home = await fetchPublic(target.url, { maxBytes: 300_000 });
      const html = home.bodyText ?? "";
      const meta = html.match(/<meta[^>]+name=["']clyvro-verification["'][^>]*>/i)?.[0]
        ?? html.match(/<meta[^>]+content=["'][^"']*["'][^>]+name=["']clyvro-verification["'][^>]*>/i)?.[0];
      const content = meta?.match(/content=["']([^"']+)["']/i)?.[1];
      if (content) matched = valueMatches(content);
    } catch { /* fallback is best-effort; the DNS verdict stands */ }
  }

  if (!matched) {
    if (flatRecords.length > 0) {
      throw new ScanError(
        "VALIDATION",
        `We found TXT record(s) at ${row.recordName}, but none matches the current code. This usually means the code was re-issued after you added the record (each new code replaces the old one), or the value was pasted incompletely. Update the TXT value to the latest code shown, wait a few minutes, then check again — or use the meta-tag method below, which needs no DNS.`,
      );
    }
    const platformHint = /(^|\.)(vercel\.app|netlify\.app|github\.io|herokuapp\.com|pages\.dev|web\.app|firebaseapp\.com)$/.test(row.domain)
      ? ` Note: ${row.domain} is a platform subdomain — its DNS zone is controlled by the platform, so TXT records can't be added for it at all. Use the meta-tag method instead (paste one line into your site's <head>), or verify a custom domain you control DNS for.`
      : "";
    throw new ScanError(
      "VALIDATION",
      `We couldn't find the record yet. No TXT records were returned for ${row.recordName} — if you just added one, DNS can take a while to spread; also double-check the host/name field is exactly ${row.recordName} at your DNS provider (some providers want just "_clyvro-verify").${platformHint} Alternatively, use the meta-tag method below — no DNS needed.`,
    );
  }

  await db.update(domainVerifications)
    .set({ status: "verified", verifiedAt: new Date(nowMs) })
    .where(eq(domainVerifications.id, row.id));

  const [creator] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.createdBy)).limit(1);
  if (creator) {
    await enqueueUserNotification({
      organizationId, userId: row.createdBy, category: "scanResults",
      kind: "domain_verified", dedupeKey: `domain-verified:${row.id}`,
      toEmail: creator.email,
      subject: `Domain verified: ${row.domain}`,
      body: `${row.domain} is now verified for your workspace. Private deep scans of this domain are unlocked (plan permitting).`,
    }, db);
  }
  return { status: "verified", domain: row.domain };
}

/** True only when a server-verified row exists for this org + domain. */
export async function isDomainVerified(organizationId: string, domainInput: string, dbOverride?: DB): Promise<boolean> {
  const db = dbOverride ?? (await getDb());
  let domain: string;
  try { domain = normalizeDomain(domainInput); } catch { return false; }
  const [row] = await db.select({ id: domainVerifications.id }).from(domainVerifications)
    .where(and(
      eq(domainVerifications.organizationId, organizationId),
      eq(domainVerifications.domain, domain),
      eq(domainVerifications.status, "verified"),
    ))
    .limit(1);
  return Boolean(row);
}

/** Gate used by deep scans. Throws DOMAIN_NOT_VERIFIED (403) when unproven. */
export async function assertDomainVerified(organizationId: string, targetUrl: string, dbOverride?: DB): Promise<void> {
  const domain = domainOfUrl(targetUrl);
  if (!(await isDomainVerified(organizationId, domain, dbOverride))) {
    throw new ScanError(
      "DOMAIN_NOT_VERIFIED",
      `Deep scans need proof you control ${domain}. Verify it once with a DNS TXT record (Scan tab → Verify a domain), then run the deep scan.`,
    );
  }
}
