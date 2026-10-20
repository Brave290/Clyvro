/**
 * Node-runtime boot: run migrations, recover interrupted scan jobs
 * (left "running" by a crashed process), and start the scan worker.
 *
 * Failure-tolerant by design: if the database is unavailable (e.g.
 * DATABASE_URL unset on a read-only serverless filesystem), boot logs
 * the error and continues — DB-backed features will surface their own
 * errors, but the public scanner and static pages must never be taken
 * down by a database problem.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { audits, scanJobs } from "@/lib/db/schema";
import { ensureScanWorker } from "@/lib/jobs";

try {
  const db = await getDb();
  await db.update(scanJobs).set({ status: "queued", updatedAt: new Date() }).where(eq(scanJobs.status, "running"));
  await db.update(audits).set({ status: "queued" }).where(eq(audits.status, "running"));
  ensureScanWorker();
} catch (err) {
  console.error(
    "[clyvro] Database boot failed — accounts/audits are unavailable until DATABASE_URL is configured. " +
      "Public pages and the quick scanner are unaffected.",
    err,
  );
}
