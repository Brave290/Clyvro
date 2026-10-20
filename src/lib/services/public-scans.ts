import { createHash } from "node:crypto";
import type { ScanReport } from "@/lib/scanner/types";
import { publicScans } from "@/lib/db/schema";
import { getDb, newId } from "@/lib/db";

/**
 * One deterministic key per finished public scan. It is derived only from
 * fields the checkpoint carries through every slice (the target, the
 * original start time, and the final URL), so if the final slice is
 * retried after a network hiccup the same scan produces the same key and
 * the unique index keeps the public totals exactly-once. Contains no
 * personal data — only the public website the visitor asked us to check.
 */
export function publicScanKey(report: Pick<ScanReport, "target" | "startedAt" | "finalUrl">): string {
  return createHash("sha256")
    .update(`public-scan:${report.target}|${report.startedAt}|${report.finalUrl ?? ""}`)
    .digest("hex");
}

/**
 * Record one finished public scan for the homepage totals. Only
 * completed/partial scans count — a failed check is never a "check".
 * Never throws: losing a stats write must never fail the visitor's scan.
 */
export async function recordPublicScan(
  report: ScanReport,
  dbOverride?: Awaited<ReturnType<typeof getDb>>,
): Promise<boolean> {
  if (report.status !== "completed" && report.status !== "partial") return false;
  try {
    const db = dbOverride ?? (await getDb());
    const inserted = await db
      .insert(publicScans)
      .values({
        id: newId(),
        scanKey: publicScanKey(report),
        status: report.status,
        pagesFetched: Math.max(0, report.coverage.pagesFetched | 0),
        findingsCount: Math.max(0, report.findings.length),
      })
      .onConflictDoNothing({ target: publicScans.scanKey })
      .returning();
    return inserted.length > 0;
  } catch {
    return false;
  }
}
