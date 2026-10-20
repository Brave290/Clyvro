import { count, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { auditPages, audits, findings, publicScans } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

/** Keys match the homepage PublicStats component contract exactly. */
export interface PublicStats {
  checks: number;
  pages: number;
  findings: number;
}

/**
 * Aggregate-only proof from real completed work: saved workspace audits
 * PLUS finished anonymous public checks (`public_scans`). Public scans
 * used to be invisible here because the resumable /api/scan flow never
 * wrote anything to the database — the homepage silently under-counted
 * every free check. Returns integers only; no workspace names, target
 * URLs, dates, or customer-identifying metadata are exposed.
 */
async function fetchPublicStats(): Promise<PublicStats> {
  const db = await getDb();
  const finished = inArray(audits.status, ["completed", "partial"]);

  const [auditRows, pageRows, findingRows, publicRows, publicSums] = await Promise.all([
    db.select({ value: count() }).from(audits).where(finished),
    db.select({ value: count() }).from(auditPages).innerJoin(audits, eq(auditPages.auditId, audits.id)).where(finished),
    db.select({ value: count() }).from(findings).innerJoin(audits, eq(findings.auditId, audits.id)).where(finished),
    db.select({ value: count() }).from(publicScans),
    db.select({
      pages: sql<number>`coalesce(sum(${publicScans.pagesFetched}), 0)::int`,
      findings: sql<number>`coalesce(sum(${publicScans.findingsCount}), 0)::int`,
    }).from(publicScans),
  ]);

  return {
    checks: (auditRows[0]?.value ?? 0) + (publicRows[0]?.value ?? 0),
    pages: (pageRows[0]?.value ?? 0) + (publicSums[0]?.pages ?? 0),
    findings: (findingRows[0]?.value ?? 0) + (publicSums[0]?.findings ?? 0),
  };
}

// Five-minute server cache: totals stay genuinely live enough for the
// "Live totals" label while keeping database wakeups minimal.
const cachedPublicStats = unstable_cache(fetchPublicStats, ["clyvro-public-stats-v3"], { revalidate: 300 });

export async function publicScanStats(): Promise<PublicStats> {
  return cachedPublicStats();
}
