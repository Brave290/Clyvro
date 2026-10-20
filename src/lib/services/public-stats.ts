import { unstable_cache } from "next/cache";
import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { audits, auditPages, findings } from "@/lib/db/schema";

const FINISHED = ["completed", "partial"] as const;

const readPublicScanStats = unstable_cache(
  async () => {
    const db = await getDb();
    const [[auditTotal], [pageTotal], [findingTotal]] = await Promise.all([
      db.select({ value: count() }).from(audits).where(inArray(audits.status, [...FINISHED])),
      db.select({ value: count() }).from(auditPages)
        .innerJoin(audits, eq(audits.id, auditPages.auditId))
        .where(inArray(audits.status, [...FINISHED])),
      db.select({ value: count() }).from(findings)
        .innerJoin(audits, eq(audits.id, findings.auditId))
        .where(inArray(audits.status, [...FINISHED])),
    ]);

    return { checks: auditTotal.value, pages: pageTotal.value, findings: findingTotal.value };
  },
  ["clyvro-public-scan-stats-v1"],
  { revalidate: 86_400 },
);

export async function publicScanStats() {
  return readPublicScanStats();
}
