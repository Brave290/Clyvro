import { and, count, eq, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { audits, memberships, organizations, usageEvents, users } from "@/lib/db/schema";
import { effectivePlanForOrg, type Plan } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";

/**
 * Central server-side entitlements & metering. Every billable operation
 * (quick scan, deep scan, scheduled run, readiness) goes through here —
 * quota checks never live in frontend components, and concurrent requests
 * cannot slip past a limit: reservation happens inside one transaction
 * that re-counts usage with the organization row locked.
 *
 * Settlement policy (billing honesty):
 * - completed + natural-partial scans charge exactly once (idempotent
 *   usage_events insert keyed on auditId).
 * - failed / cancelled / timed_out scans are FREE — the customer never
 *   pays for a check that didn't deliver a report.
 */

/** Locked org row read + effective plan. */
export async function planWithLock(db: DB, organizationId: string): Promise<{ plan: Plan; org: typeof organizations.$inferSelect }> {
  const rows = await db.select().from(organizations)
    .where(eq(organizations.id, organizationId))
    .for("update");
  const org = rows[0];
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  return { plan: effectivePlanForOrg(org), org };
}

/**
 * Atomically reserve one scan against the monthly quota. Runs inside the
 * caller's transaction so two simultaneous requests can never both pass
 * the same last slot (org row is locked, usage is re-counted inside).
 */
export async function reserveScanQuota(tx: DB, organizationId: string): Promise<void> {
  const { plan } = await planWithLock(tx, organizationId);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ used }] = await tx.select({ used: count() }).from(usageEvents)
    .where(and(eq(usageEvents.organizationId, organizationId), eq(usageEvents.kind, "scan"), sql`${usageEvents.createdAt} >= ${monthStart}`));
  const [{ inFlight }] = await tx.select({ inFlight: count() }).from(audits)
    .where(and(
      eq(audits.organizationId, organizationId),
      sql`${audits.status} IN ('queued','running')`,
    ));
  if (used + inFlight >= plan.scansPerMonth) {
    throw new ScanError(
      "QUOTA_EXCEEDED",
      `You've used your ${plan.name} plan's ${plan.scansPerMonth} scans for this month. Quotas reset on the 1st — or upgrade any time from Billing.`,
    );
  }
}

/**
 * Idempotent quota settlement: exactly one usage_event per audit, ever.
 * Only completed and naturally-partial reports charge; failed, cancelled
 * and timed-out runs are free.
 */
export async function settleScanUsage(
  tx: DB,
  audit: { id: string; organizationId: string },
  reportStatus: "completed" | "partial" | "failed" | "timed_out" | "cancelled",
): Promise<void> {
  if (reportStatus === "failed" || reportStatus === "timed_out" || reportStatus === "cancelled") return;
  await tx.insert(usageEvents)
    .values({ id: newId(), organizationId: audit.organizationId, auditId: audit.id, kind: "scan" })
    .onConflictDoNothing({ target: usageEvents.auditId });
}

/**
 * Founder life grant: the owner (legateakanjimusab@gmail.com) is
 * Ultra-for-life — never needs renewal and can never be degraded by
 * reconcileExpiredPlans (that only touches rows WITH a past expiry).
 * Server-only module; this email is never rendered on the website.
 * Override/extend with CLYVRO_OWNER_EMAILS (comma-separated) if ever needed.
 */
export const OWNER_EMAILS = (process.env.CLYVRO_OWNER_EMAILS ?? "legateakanjimusab@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Idempotent: every organization owned by an owner email is set to
 * Ultra Agency with no expiry (life grant). Safe to run at boot/deploys.
 */
export async function ensureOwnerLifeGrant(dbOverride?: DB): Promise<{ granted: number }> {
  const db = dbOverride ?? (await getDb());
  const owned = await db
    .select({ organizationId: organizations.id })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.role, "owner"), inArray(users.email, OWNER_EMAILS)));
  let granted = 0;
  for (const row of owned) {
    const updated = await db.update(organizations)
      .set({ planId: "ultra-agency", planExpiresAt: null })
      .where(and(
        eq(organizations.id, row.organizationId),
        or(ne(organizations.planId, "ultra-agency"), isNotNull(organizations.planExpiresAt)),
      ))
      .returning();
    granted += updated.length;
  }
  return { granted };
}

/**
 * Persistently degrade lapsed paid plans back to freemium (founder
 * directive: users whose plan expired and who didn't pay go back to
 * Freemium). Purchases with `planExpiresAt = NULL` (life grants, e.g. the
 * founder's Ultra-for-life) and admin overrides are never touched. The
 * expiry timestamp is kept as history; only planId changes.
 */
export async function reconcileExpiredPlans(dbOverride?: DB): Promise<{ degraded: number }> {
  const db = dbOverride ?? (await getDb());
  const rows = await db.update(organizations)
    .set({ planId: "freemium" })
    .where(and(
      ne(organizations.planId, "freemium"),
      isNotNull(organizations.planExpiresAt),
      lt(organizations.planExpiresAt, new Date()),
    ))
    .returning();
  return { degraded: rows.length };
}
