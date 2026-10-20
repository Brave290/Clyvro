import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.CLYVRO_DB_MEMORY = "1";
vi.mock("@/lib/scanner/fetcher", () => ({ fetchPublic: vi.fn() }));

type DB = import("@/lib/db").DB;
let db: DB;
let registerAccount: typeof import("@/lib/services/accounts").registerAccount;
let createProject: typeof import("@/lib/services/audits").createProject;
let schedules: typeof import("@/lib/services/schedules");
let organizations: typeof import("@/lib/db/schema").organizations;
let scanSchedules: typeof import("@/lib/db/schema").scanSchedules;
let audits: typeof import("@/lib/db/schema").audits;
let scanJobs: typeof import("@/lib/db/schema").scanJobs;

beforeAll(async () => {
  db = await (await import("@/lib/db")).createDb();
  registerAccount = (await import("@/lib/services/accounts")).registerAccount;
  createProject = (await import("@/lib/services/audits")).createProject;
  schedules = await import("@/lib/services/schedules");
  const schema = await import("@/lib/db/schema");
  organizations = schema.organizations;
  scanSchedules = schema.scanSchedules;
  audits = schema.audits;
  scanJobs = schema.scanJobs;
}, 60_000);

async function proWorkspace(email: string) {
  const account = await registerAccount({ name: "Schedule QA", email, password: "a-long-password-123" }, db);
  const project = await createProject(account.organizationId, account.userId, { name: "Owned website", siteUrl: "https://github.com" }, db);
  await db.update(organizations).set({ planId: "pro" }).where(eq(organizations.id, account.organizationId));
  return { ...account, project };
}

describe("cost-first scheduled monitoring", () => {
  it("requires monitoring entitlement and stores local weekly recurrence safely", async () => {
    const account = await registerAccount({ name: "Free schedule", email: "free-schedule@example.com", password: "a-long-password-123" }, db);
    const project = await createProject(account.organizationId, account.userId, { name: "Website", siteUrl: "https://github.com" }, db);
    await expect(schedules.createScanSchedule(account.organizationId, account.userId, {
      projectId: project.id, cadence: "daily", timeZone: "Africa/Lagos",
    }, db)).rejects.toMatchObject({ code: "PLAN_LIMIT" });

    const paid = await proWorkspace("weekly-schedule@example.com");
    const schedule = await schedules.createScanSchedule(paid.organizationId, paid.userId, {
      projectId: paid.project.id, cadence: "weekly", weekday: 2, timeZone: "Africa/Lagos", locale: "pt-br",
    }, db);
    expect(schedule.enabled).toBe(true);
    expect(schedule.timeZone).toBe("Africa/Lagos");
    expect(schedule.locale).toBe("pt-BR");
    expect(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: schedule.timeZone }).format(schedule.nextRunAt)).toBe("Tue");
    await expect(schedules.createScanSchedule(paid.organizationId, paid.userId, {
      projectId: paid.project.id, cadence: "daily", timeZone: "Africa/Lagos",
    }, db)).rejects.toThrow(); // one schedule per saved project
  }, 60_000);

  it("enqueues an overdue schedule once, respects its workspace boundary, and advances its next run", async () => {
    const paid = await proWorkspace("daily-schedule@example.com");
    await schedules.createScanSchedule(paid.organizationId, paid.userId, {
      projectId: paid.project.id, cadence: "daily", timeZone: "Africa/Lagos", locale: "fr-FR",
    }, db);
    const [schedule] = await db.select().from(scanSchedules).where(eq(scanSchedules.projectId, paid.project.id)).limit(1);
    if (!schedule) throw new Error("schedule fixture missing");
    const now = new Date("2026-10-20T12:00:00.000Z");
    await db.update(scanSchedules).set({ nextRunAt: new Date("2026-10-19T03:00:00.000Z") }).where(eq(scanSchedules.id, schedule.id));

    const first = await schedules.dispatchDueSchedules({ now, maxSchedules: 3, dbOverride: db });
    expect(first.enqueued).toBe(1);
    expect(first.auditIds).toHaveLength(1);
    const [audit] = await db.select().from(audits).where(and(eq(audits.id, first.auditIds[0]!), eq(audits.organizationId, paid.organizationId))).limit(1);
    expect(audit?.status).toBe("queued");
    expect(audit?.locale).toBe("fr-FR");
    const [job] = await db.select().from(scanJobs).where(eq(scanJobs.auditId, first.auditIds[0]!)).limit(1);
    expect(job?.status).toBe("queued");
    expect(job?.checkpoint).toBeNull();

    const second = await schedules.dispatchDueSchedules({ now, maxSchedules: 3, dbOverride: db });
    expect(second.enqueued).toBe(0);
    expect(second.auditIds).toHaveLength(0);

    const [advanced] = await db.select().from(scanSchedules).where(eq(scanSchedules.id, schedule.id)).limit(1);
    expect(advanced?.nextRunAt.getTime()).toBeGreaterThan(now.getTime());
  }, 60_000);
});
