import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { count, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notificationOutbox, scanJobs } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Health endpoint (safe for Cron-job.org / uptime monitors).
 *
 * - No credentials → public liveness only: `{ status: "ok" }`. It never
 *   triggers scans or expensive work.
 * - `Authorization: Bearer $CRON_SECRET` (constant-time compared) →
 *   authenticated diagnostics: a bounded-timeout database read/write-safe
 *   connectivity check (`SELECT 1`) plus queue depths. No secrets, URLs,
 *   stack traces, or per-customer data are ever returned.
 *
 * Note: pinging this keeps nothing "awake" by itself — it reports health.
 * Neon compute scale-to-zero behaviour depends on the Neon plan; the
 * dispatcher (/api/cron/dispatch) is what advances queued work.
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const provided = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "") : "";
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const base = { status: "ok" as const, service: "clyvro", time: new Date().toISOString() };
  if (!authorized(request)) {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const db = await withTimeout(getDb(), 3_000);
    // Bounded real read against the production database (connectivity proof).
    const [queued] = await withTimeout(
      db.select({ value: count() }).from(scanJobs).where(inArray(scanJobs.status, ["queued", "running"])),
      2_500,
    );
    const [pendingMail] = await db.select({ value: count() }).from(notificationOutbox).where(inArray(notificationOutbox.status, ["pending", "failed"]));
    return NextResponse.json({
      ...base,
      diagnostics: { database: "ok", activeScanJobs: queued.value, pendingNotifications: pendingMail.value },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "degraded", service: "clyvro", time: new Date().toISOString(), diagnostics: { database: "unreachable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
