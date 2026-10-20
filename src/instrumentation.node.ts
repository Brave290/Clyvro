/**
 * Node-runtime boot: run migrations, recover interrupted scan jobs
 * (left "running" by a crashed process), and start the scan worker.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { audits, scanJobs } from "@/lib/db/schema";
import { ensureScanWorker } from "@/lib/jobs";

const db = await getDb();
await db.update(scanJobs).set({ status: "queued", updatedAt: new Date() }).where(eq(scanJobs.status, "running"));
await db.update(audits).set({ status: "queued" }).where(eq(audits.status, "running"));
ensureScanWorker();
