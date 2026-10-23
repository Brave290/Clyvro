/**
 * Lab — authorized HTTP repeater + path catalogue for ethical hackers.
 *
 * GET / HEAD / OPTIONS only, verified domain, Pro/Agency, SSRF-safe.
 * Not Pentest. No brute force, no inject payloads, no exploit PoCs.
 */
import { assertPublicUrl, type Resolver } from "@/lib/scanner/ssrf";
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";
import { getDb, type DB } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { effectivePlanForOrg, planAtLeast } from "@/lib/plans";
import { isDomainVerified } from "@/lib/services/domain-verification";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { CATALOG_PATHS, CATALOG_SIZE } from "@/lib/pentest/catalog";
import { ownProductScanHeaders, PRODUCT_SCAN_UA } from "@/lib/shield/product-scan";
import { runLabDiscoveryScan, type LabScanReport } from "@/lib/lab/discover";

const LAB_METHODS = ["GET", "HEAD", "OPTIONS"] as const;
export type LabMethod = (typeof LAB_METHODS)[number];

export interface LabAccess {
  allowed: boolean;
  planName: string;
  catalogSize: number;
}

export interface LabProbeResult {
  method: LabMethod;
  path: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  durationMs: number;
  headers: Record<string, string>;
  body: string | null;
  truncated: boolean;
}

export async function labAccess(organizationId: string, dbOverride?: DB): Promise<LabAccess> {
  const db = dbOverride ?? (await getDb());
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  const plan = effectivePlanForOrg(org);
  return { allowed: planAtLeast(plan, "pro"), planName: plan.name, catalogSize: CATALOG_SIZE };
}

export function labCatalog(query = ""): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG_PATHS.slice(0, 80);
  return CATALOG_PATHS.filter((p) => p.toLowerCase().includes(q)).slice(0, 80);
}

function normalizeLabPath(raw: string): string {
  const path = raw.trim();
  if (!path.startsWith("/")) throw new ScanError("VALIDATION", "Path must start with /.");
  if (path.length > 200) throw new ScanError("VALIDATION", "Path is too long.");
  if (path.includes("://") || path.includes("\\") || path.includes("\0") || path.includes("..")) {
    throw new ScanError("VALIDATION", "That path is not allowed.");
  }
  return path.replace(/\/+/g, "/");
}

function parseMethod(raw: unknown): LabMethod {
  const method = typeof raw === "string" ? raw.toUpperCase() : "";
  if ((LAB_METHODS as readonly string[]).includes(method)) return method as LabMethod;
  throw new ScanError("VALIDATION", "Lab only sends GET, HEAD or OPTIONS.");
}

async function verifiedApex(organizationId: string, hostname: string, db: DB): Promise<string> {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  const candidates = [host];
  const parts = host.split(".");
  for (let i = 1; i < parts.length - 1; i += 1) candidates.push(parts.slice(i).join("."));
  for (const candidate of candidates) {
    if (await isDomainVerified(organizationId, candidate, db)) return candidate;
  }
  throw new ScanError("DOMAIN_NOT_VERIFIED", "Verify this domain first (same proof as Pentest).");
}

export async function runLabProbe(
  organizationId: string,
  userId: string,
  input: {
    url: string;
    path: string;
    method?: unknown;
    ownsOrAuthorized?: boolean;
    acceptLogs?: boolean;
    noThirdPartyAttack?: boolean;
  },
  deps: { transport?: Transport; resolver?: Resolver; db?: DB } = {},
): Promise<LabProbeResult> {
  const db = deps.db ?? (await getDb());
  const access = await labAccess(organizationId, db);
  if (!access.allowed) {
    throw new ScanError("PLAN_LIMIT", `Lab is on Pro and Agency — your workspace is on the ${access.planName} plan.`);
  }
  if (!input.ownsOrAuthorized) throw new ScanError("VALIDATION", "Tick that you own this site or have written permission.");
  if (!input.acceptLogs) throw new ScanError("VALIDATION", "Tick that you accept this request may appear in the site's logs.");
  if (!input.noThirdPartyAttack) throw new ScanError("VALIDATION", "Tick that you will not use Lab to attack anyone else.");

  const ok = await tryConsumeUserAction("lab-probe", userId, 40, 60_000, db);
  if (!ok) throw new ScanError("RATE_LIMITED", "Slow down — Lab allows 40 requests per minute.");

  const method = parseMethod(input.method ?? "GET");
  const path = normalizeLabPath(input.path);
  const normalized = normalizeScanInput(input.url.trim());
  const target = await assertPublicUrl(normalized, deps.resolver);
  await verifiedApex(organizationId, target.url.hostname, db);

  const dest = new URL(path, target.url.origin);
  if (dest.origin !== target.url.origin) throw new ScanError("VALIDATION", "Path must stay on the same site.");

  const extraHeaders = await ownProductScanHeaders(dest.hostname);
  const probe = await fetchPublic(dest, {
    method,
    timeoutMs: 8000,
    maxBytes: 12_000,
    allowNonHtmlBody: true,
    headersOnly: method === "HEAD" || method === "OPTIONS",
    captureAllHeaders: true,
    transport: deps.transport,
    resolver: deps.resolver,
    userAgent: PRODUCT_SCAN_UA,
    extraHeaders,
  });

  const headers = { ...(probe.allHeaders ?? probe.headers ?? {}) };
  for (const key of Object.keys(headers)) {
    if (/cookie|authorization|set-cookie/i.test(key)) delete headers[key];
  }

  return {
    method,
    path,
    requestedUrl: probe.requestedUrl,
    finalUrl: probe.finalUrl,
    status: probe.status,
    contentType: probe.contentType,
    durationMs: probe.durationMs,
    headers,
    body: method === "HEAD" ? null : (probe.bodyText ?? "").slice(0, 8_000),
    truncated: probe.truncated || (probe.bodyText ?? "").length > 8_000,
  };
}

export async function runLabSiteScan(
  organizationId: string,
  userId: string,
  input: {
    url: string;
    ownsOrAuthorized?: boolean;
    acceptLogs?: boolean;
    noThirdPartyAttack?: boolean;
  },
  deps: { transport?: Transport; resolver?: Resolver; db?: DB } = {},
): Promise<LabScanReport> {
  const db = deps.db ?? (await getDb());
  const access = await labAccess(organizationId, db);
  if (!access.allowed) {
    throw new ScanError("PLAN_LIMIT", `Lab is on Pro and Agency — your workspace is on the ${access.planName} plan.`);
  }
  if (!input.ownsOrAuthorized) throw new ScanError("VALIDATION", "Tick that you own this site or have written permission.");
  if (!input.acceptLogs) throw new ScanError("VALIDATION", "Tick that you accept this request may appear in the site's logs.");
  if (!input.noThirdPartyAttack) throw new ScanError("VALIDATION", "Tick that you will not use Lab to attack anyone else.");

  const ok = await tryConsumeUserAction("lab-scan", userId, 4, 60_000, db);
  if (!ok) throw new ScanError("RATE_LIMITED", "Slow down — Lab site scans are limited to 4 per minute.");

  const normalized = normalizeScanInput(input.url.trim());
  const target = await assertPublicUrl(normalized, deps.resolver);
  await verifiedApex(organizationId, target.url.hostname, db);
  return runLabDiscoveryScan(target.url, { transport: deps.transport, resolver: deps.resolver });
}
