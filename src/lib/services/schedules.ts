import { and, asc, count, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { audits, organizations, projects, scanJobs, scanSchedules, usageEvents } from "@/lib/db/schema";
import { effectivePlan } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";
import { normalizeLocale } from "@/lib/locale";

export type ScheduleCadence = "daily" | "weekly";
const DISPATCH_UTC_HOUR = 3;
const EARLY_CRON_WINDOW_MS = 60 * 60 * 1000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function validateTimeZone(value: string) {
  const zone = value.trim();
  if (!zone || zone.length > 100) throw new ScanError("VALIDATION", "Choose a valid time zone.");
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date()); }
  catch { throw new ScanError("VALIDATION", "Choose a valid time zone."); }
  return zone;
}

function weekdayAt(date: Date, timeZone: string) {
  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(date);
  return DAYS.indexOf(label);
}

/** Vercel Cron dispatches at 03:00 UTC; weekly choices are evaluated in the saved IANA zone. */
function nextDispatchAt(after: Date, cadence: ScheduleCadence, weekday: number | null, timeZone: string) {
  const candidate = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), DISPATCH_UTC_HOUR));
  if (candidate.getTime() <= after.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  if (cadence === "daily") return candidate;
  if (weekday === null || weekday < 0 || weekday > 6) throw new ScanError("VALIDATION", "Choose a day of the week.");
  for (let i = 0; i < 8; i++) {
    if (weekdayAt(candidate, timeZone) === weekday) return candidate;
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  throw new ScanError("VALIDATION", "Couldn't calculate the next scheduled run.");
}

function nextQuotaReset(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, DISPATCH_UTC_HOUR));
}

export async function listScanSchedules(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select({
    id: scanSchedules.id,
    projectId: scanSchedules.projectId,
    projectName: projects.name,
    siteUrl: projects.siteUrl,
    enabled: scanSchedules.enabled,
    cadence: scanSchedules.cadence,
    weekday: scanSchedules.weekday,
    timeZone: scanSchedules.timeZone,
    nextRunAt: scanSchedules.nextRunAt,
    lastRunAt: scanSchedules.lastRunAt,
    locale: scanSchedules.locale,
    lastError: scanSchedules.lastError,
  })
    .from(scanSchedules)
    .innerJoin(projects, eq(projects.id, scanSchedules.projectId))
    .where(eq(scanSchedules.organizationId, organizationId))
    .orderBy(asc(scanSchedules.nextRunAt));
}

export async function createScanSchedule(
  organizationId: string,
  userId: string,
  input: { projectId: string; cadence: ScheduleCadence; weekday?: number; timeZone: string; locale?: unknown },
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const timeZone = validateTimeZone(input.timeZone);
  if (input.cadence !== "daily" && input.cadence !== "weekly") throw new ScanError("VALIDATION", "Choose daily or weekly monitoring.");
  const weekday = input.cadence === "weekly" ? input.weekday ?? null : null;
  if (input.cadence === "weekly" && (weekday === null || !Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
    throw new ScanError("VALIDATION", "Choose a valid day of the week.");
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  const plan = effectivePlan(org.planId, org.planExpiresAt);
  if (!plan.monitoring) throw new ScanError("PLAN_LIMIT", "Scheduled monitoring is included with the Pro and Ultra Agency plans.");

  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .limit(1);
  if (!project) throw new ScanError("NOT_FOUND", "Website not found in this workspace.");

  const now = new Date();
  const schedule = {
    id: newId(), organizationId, projectId: project.id, createdBy: userId,
    enabled: true, cadence: input.cadence, weekday, timeZone, locale: normalizeLocale(input.locale),
    nextRunAt: nextDispatchAt(now, input.cadence, weekday, timeZone),
  };
  await db.insert(scanSchedules).values(schedule);
  return schedule;
}

export async function setScanScheduleEnabled(organizationId: string, scheduleId: string, enabled: boolean, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(scanSchedules)
    .where(and(eq(scanSchedules.id, scheduleId), eq(scanSchedules.organizationId, organizationId))).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Schedule not found.");
  await db.update(scanSchedules).set({ enabled, lastError: null, updatedAt: new Date() }).where(eq(scanSchedules.id, scheduleId));
  return { id: scheduleId, enabled };
}

export async function deleteScanSchedule(organizationId: string, scheduleId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [existing] = await db.select({ id: scanSchedules.id }).from(scanSchedules)
    .where(and(eq(scanSchedules.id, scheduleId), eq(scanSchedules.organizationId, organizationId))).limit(1);
  if (!existing) throw new ScanError("NOT_FOUND", "Schedule not found.");
  await db.delete(scanSchedules).where(and(eq(scanSchedules.id, scheduleId), eq(scanSchedules.organizationId, organizationId)));
  return { id: scheduleId, deleted: true };
}

/** Enqueue only due work, transactionally advancing each schedule exactly once. */
export async function dispatchDueSchedules(options: { now?: Date; maxSchedules?: number; dbOverride?: DB } = {}) {
  const db = options.dbOverride ?? (await getDb());
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(10, options.maxSchedules ?? 3));
  const dueBefore = new Date(now.getTime() + EARLY_CRON_WINDOW_MS);

  return db.transaction(async (tx) => {
    const due = await tx.select().from(scanSchedules)
      .where(and(eq(scanSchedules.enabled, true), lte(scanSchedules.nextRunAt, dueBefore)))
      .orderBy(asc(scanSchedules.nextRunAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    const result = { enqueued: 0, paused: 0, auditIds: [] as string[] };
    for (const schedule of due) {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, schedule.organizationId)).limit(1);
      if (!org) {
        await tx.update(scanSchedules).set({ enabled: false, lastError: "Workspace no longer exists.", updatedAt: now }).where(eq(scanSchedules.id, schedule.id));
        result.paused++;
        continue;
      }
      const plan = effectivePlan(org.planId, org.planExpiresAt);
      if (!plan.monitoring) {
        await tx.update(scanSchedules).set({ enabled: false, lastError: "Monitoring is not included in the current plan.", updatedAt: now }).where(eq(scanSchedules.id, schedule.id));
        result.paused++;
        continue;
      }

      const [project] = await tx.select().from(projects)
        .where(and(eq(projects.id, schedule.projectId), eq(projects.organizationId, schedule.organizationId), isNull(projects.archivedAt)))
        .limit(1);
      if (!project) {
        await tx.update(scanSchedules).set({ enabled: false, lastError: "Website is archived or unavailable.", updatedAt: now }).where(eq(scanSchedules.id, schedule.id));
        result.paused++;
        continue;
      }

      const [[used], [active]] = await Promise.all([
        tx.select({ value: count() }).from(usageEvents)
          .where(and(eq(usageEvents.organizationId, schedule.organizationId), gte(usageEvents.createdAt, startOfUtcMonth(now)))),
        tx.select({ value: count() }).from(audits)
          .where(and(eq(audits.organizationId, schedule.organizationId), inArray(audits.status, ["queued", "running"]))),
      ]);
      if (used.value + active.value >= plan.scansPerMonth) {
        await tx.update(scanSchedules).set({ nextRunAt: nextQuotaReset(now), lastError: "Monthly scan quota reached; will retry after the next UTC quota reset.", updatedAt: now }).where(eq(scanSchedules.id, schedule.id));
        result.paused++;
        continue;
      }

      const auditId = newId();
      await tx.insert(audits).values({
        id: auditId, organizationId: schedule.organizationId, projectId: project.id,
        requestedBy: schedule.createdBy, status: "queued", targetUrl: project.siteUrl,
        locale: schedule.locale, auditTypes: ["generic"], scanMode: "normal",
      });
      await tx.insert(scanJobs).values({ id: newId(), auditId, status: "queued" });
      const nextRunAt = nextDispatchAt(
        new Date(now.getTime() + EARLY_CRON_WINDOW_MS), schedule.cadence,
        schedule.weekday, schedule.timeZone,
      );
      await tx.update(scanSchedules).set({ nextRunAt, lastRunAt: now, lastError: null, updatedAt: now }).where(eq(scanSchedules.id, schedule.id));
      result.enqueued++;
      result.auditIds.push(auditId);
    }
    return result;
  });
}
