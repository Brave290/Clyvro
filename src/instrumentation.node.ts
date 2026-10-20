/**
 * Node-runtime boot: initialize the database/migration layer and start the
 * convenience polling worker only in local development. Production jobs are
 * claimed through finite scan slices and recover from expired leases; boot
 * must never unconditionally reset every running job on a serverless instance.
 *
 * Failure-tolerant by design: if the database is unavailable (e.g.
 * DATABASE_URL unset on a read-only serverless filesystem), boot logs the
 * error and continues — public pages remain available.
 */
import { getDb } from "@/lib/db";
import { ensureScanWorker } from "@/lib/jobs";

try {
  await getDb();
  if (process.env.NODE_ENV !== "production") ensureScanWorker();
} catch (err) {
  console.error(
    "[clyvro] Database boot failed — accounts/audits are unavailable until DATABASE_URL is configured. " +
      "Public pages and the quick scanner are unaffected.",
    err,
  );
}
