import { and, asc, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import {
  adminAuditLog, audits, memberships, organizations, payments, projects, scanJobs, scanSchedules, shareTokens, usageEvents, users,
} from "@/lib/db/schema";
import { PLANS } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";
import { deleteAccount } from "./account";
import { isOwnerEmail } from "./entitlements";

/**
 * Clyvro Admin Control Center (platform administration).
 *
 * Access model: `users.isPlatformAdmin` OR an email listed in
 * CLYVRO_ADMIN_EMAILS (server env; the founder address is the built-in
 * default so the owner can always get in). Env-listed admins are promoted
 * (flag persisted) on first admin access. There is NO self-service path:
 * no API a normal user can call sets this flag, and admin routes re-check
 * the database row on every request. Suspended users are blocked at
 * sign-in; suspension also revokes their report share links. Auth.js JWT
 * sessions already issued expire naturally (max 30 days) — suspension
 * takes effect at next sign-in, which is documented, not hidden.
 *
 * Admin plan overrides live in organizations.adminPlanId — explicitly
 * labelled and kept distinct from the purchased planId/planExpiresAt.
 */

export const ADMIN_EMAILS = (process.env.CLYVRO_ADMIN_EMAILS ?? "legateakanjimusab@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export interface AdminActor { userId: string; email: string }

export async function logAdmin(
  db: DB, actor: AdminActor, action: string,
  targetType?: string, targetId?: string, detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(adminAuditLog).values({
    id: newId(), actorEmail: actor.email, action,
    targetType: targetType ?? null, targetId: targetId ?? null, detail: detail ?? null,
  });
}

/** Resolve + authorize a platform admin from a session user id. Throws FORBIDDEN otherwise. */
export async function requireAdminUser(userId: string, dbOverride?: DB): Promise<AdminActor> {
  const db = dbOverride ?? (await getDb());
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.suspendedAt) throw new ScanError("FORBIDDEN", "Administrator access required.");
  const envAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
  if (!user.isPlatformAdmin && !envAdmin) throw new ScanError("FORBIDDEN", "Administrator access required.");
  if (envAdmin && !user.isPlatformAdmin) {
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
  }
  return { userId: user.id, email: user.email };
}

export async function listAdminUsers(query = "", dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const q = query.trim().toLowerCase();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
  const filtered = q ? rows.filter((u) => u.email.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q)) : rows;
  const memberRows = filtered.length
    ? await db.select().from(memberships).where(inArray(memberships.userId, filtered.map((u) => u.id)))
    : [];
  const orgName = new Map<string, string>();
  if (memberRows.length) {
    const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations)
      .where(inArray(organizations.id, [...new Set(memberRows.map((m) => m.organizationId))]));
    for (const o of orgs) orgName.set(o.id, o.name);
  }
  return filtered.map((u) => ({
    id: u.id, email: u.email, name: u.name,
    isPlatformAdmin: u.isPlatformAdmin, suspended: Boolean(u.suspendedAt),
    // The owner account (and any platform admin) is protected: the admin
    // console must not offer delete/suspend for it, and the services refuse.
    isOwner: isOwnerEmail(u.email),
    protectedAccount: u.isPlatformAdmin || ADMIN_EMAILS.includes(u.email.toLowerCase()) || isOwnerEmail(u.email),
    createdAt: u.createdAt.toISOString(),
    workspaces: memberRows.filter((m) => m.userId === u.id)
      .map((m) => ({ organizationId: m.organizationId, name: orgName.get(m.organizationId) ?? "Workspace", role: m.role })),
  }));
}

export async function listAdminOrgs(dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(200);
  const projectRows = orgs.length
    ? await db.select({ id: projects.id, organizationId: projects.organizationId, name: projects.name, siteUrl: projects.siteUrl })
      .from(projects).where(inArray(projects.organizationId, orgs.map((o) => o.id))).orderBy(asc(projects.createdAt))
    : [];
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return Promise.all(orgs.map(async (org) => {
    const [{ value: members }] = await db.select({ value: count() }).from(memberships).where(eq(memberships.organizationId, org.id));
    const [{ value: scansUsed }] = await db.select({ value: count() }).from(usageEvents)
      .where(and(eq(usageEvents.organizationId, org.id), eq(usageEvents.kind, "scan")));
    void monthStart;
    const [lastPayment] = await db.select().from(payments).where(eq(payments.organizationId, org.id)).orderBy(desc(payments.createdAt)).limit(1);
    return {
      id: org.id, name: org.name, planId: org.planId,
      planExpiresAt: org.planExpiresAt?.toISOString() ?? null,
      adminPlanId: org.adminPlanId, adminPlanNote: org.adminPlanNote,
      members, scansUsed,
      projects: projectRows.filter((p) => p.organizationId === org.id)
        .map((p) => ({ id: p.id, name: p.name, siteUrl: p.siteUrl })),
      lastPayment: lastPayment ? { status: lastPayment.status, planId: lastPayment.planId, at: lastPayment.createdAt.toISOString() } : null,
      createdAt: org.createdAt.toISOString(),
    };
  }));
}

export async function listAdminJobs(dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select({ job: scanJobs, audit: audits }).from(scanJobs)
    .innerJoin(audits, eq(audits.id, scanJobs.auditId))
    .orderBy(desc(scanJobs.updatedAt)).limit(50);
  return rows.map(({ job, audit }) => ({
    jobId: job.id, auditId: audit.id, jobStatus: job.status, auditStatus: audit.status,
    scanMode: audit.scanMode, targetUrl: audit.targetUrl,
    attempts: job.attempts, failureCount: job.failureCount,
    lastError: job.lastError, updatedAt: job.updatedAt.toISOString(),
  }));
}

export async function listAdminLog(dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(50);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Explicit admin plan override — distinct from any purchased subscription. */
export async function setAdminPlanOverride(
  actor: AdminActor, organizationId: string, planId: string | null, note: string | null,
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  if (planId !== null && !PLANS.some((p) => p.id === planId)) throw new ScanError("VALIDATION", "Unknown plan.");
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  await db.update(organizations).set({
    adminPlanId: planId,
    adminPlanNote: note?.slice(0, 300) ?? null,
    adminPlanSetBy: actor.email,
    adminPlanSetAt: new Date(),
  }).where(eq(organizations.id, organizationId));
  await logAdmin(db, actor, planId ? "org.plan_override_set" : "org.plan_override_cleared", "organization", organizationId, { planId, note });
  return { organizationId, adminPlanId: planId };
}

export async function setUserSuspended(actor: AdminActor, userId: string, suspended: boolean, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  if (userId === actor.userId) throw new ScanError("VALIDATION", "You can't suspend your own admin account.");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ScanError("NOT_FOUND", "User not found.");
  if (isOwnerEmail(user.email)) {
    throw new ScanError("FORBIDDEN", "The platform owner account can't be suspended.");
  }
  if (user.isPlatformAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    throw new ScanError("FORBIDDEN", "Platform administrators can't be suspended from here.");
  }
  await db.update(users).set({ suspendedAt: suspended ? new Date() : null }).where(eq(users.id, userId));
  if (suspended) {
    // Revoke the user's outstanding report share links immediately.
    await db.update(shareTokens).set({ revokedAt: new Date() })
      .where(and(eq(shareTokens.createdBy, userId), isNull(shareTokens.revokedAt)));
  }
  await logAdmin(db, actor, suspended ? "user.suspended" : "user.unsuspended", "user", userId, { email: user.email });
  return { userId, suspended };
}

/** Safe admin deletion: same rules as self-service deletion (sole-owner cascades, shared teams block). */
export async function deleteUserAsAdmin(actor: AdminActor, userId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  if (userId === actor.userId) throw new ScanError("VALIDATION", "You can't delete your own admin account here. Use Settings → Delete account.");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ScanError("NOT_FOUND", "User not found.");
  if (isOwnerEmail(user.email)) {
    throw new ScanError("FORBIDDEN", "The platform owner account can't be deleted.");
  }
  if (user.isPlatformAdmin || ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    throw new ScanError("FORBIDDEN", "Platform administrators can't be deleted from here.");
  }
  await deleteAccount(userId, user.email, db);
  await logAdmin(db, actor, "user.deleted", "user", userId, { email: user.email });
  return { userId, deleted: true };
}

/**
 * Transfer a project (with its audits, schedules and share links) to the
 * workspace owned by the Clyvro account registered under `recipientEmail`.
 * This is the admin handover path — e.g. selling/handling over a project.
 * The recipient must already have an account; we never silently create
 * accounts or move data to an unverified address. The client assignment
 * is cleared because clients belong to the source workspace. Everything
 * moves in one transaction and is audit-logged.
 */
export async function transferProjectAsAdmin(
  actor: AdminActor, projectId: string, recipientEmail: string, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const email = recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ScanError("VALIDATION", "Enter a valid email address for the recipient.");
  }
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new ScanError("NOT_FOUND", "Project not found.");
  const [recipient] = await db.select().from(users).where(ilike(users.email, email)).limit(1);
  if (!recipient) {
    throw new ScanError("VALIDATION", `No Clyvro account uses ${email} yet. Ask them to create an account first, then transfer.`);
  }
  const [membership] = await db.select().from(memberships)
    .where(and(eq(memberships.userId, recipient.id), eq(memberships.role, "owner")))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  if (!membership) throw new ScanError("VALIDATION", "That account doesn't own a workspace to receive the project.");
  const toOrganizationId = membership.organizationId;
  if (toOrganizationId === project.organizationId) {
    throw new ScanError("VALIDATION", "That account already has this project in its workspace.");
  }

  await db.transaction(async (tx) => {
    const projectAudits = await tx.select({ id: audits.id }).from(audits).where(eq(audits.projectId, project.id));
    await tx.update(projects)
      .set({ organizationId: toOrganizationId, clientId: null })
      .where(eq(projects.id, project.id));
    await tx.update(audits).set({ organizationId: toOrganizationId }).where(eq(audits.projectId, project.id));
    await tx.update(scanSchedules).set({ organizationId: toOrganizationId }).where(eq(scanSchedules.projectId, project.id));
    if (projectAudits.length) {
      await tx.update(shareTokens).set({ organizationId: toOrganizationId })
        .where(inArray(shareTokens.auditId, projectAudits.map((a) => a.id)));
    }
  });
  await logAdmin(db, actor, "project.transferred", "project", project.id, {
    projectName: project.name, fromOrganizationId: project.organizationId, toOrganizationId, recipientEmail: recipient.email,
  });
  return { projectId: project.id, toOrganizationId, recipientEmail: recipient.email };
}

/** Force-retry one failed/timed-out job from the admin console. */
export async function adminRetryJob(actor: AdminActor, auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit) throw new ScanError("NOT_FOUND", "Audit not found.");
  if (!["failed", "timed_out", "cancelled"].includes(audit.status)) {
    throw new ScanError("VALIDATION", "Only failed, timed-out, or cancelled jobs can be retried.");
  }
  await db.update(audits).set({ status: "queued", startedAt: null, finishedAt: null, errorCode: null, errorMessage: null })
    .where(eq(audits.id, auditId));
  await db.update(scanJobs).set({
    status: "queued", checkpoint: null, failureCount: 0, lastError: null,
    lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date(),
  }).where(eq(scanJobs.auditId, auditId));
  await logAdmin(db, actor, "job.retried", "audit", auditId, { scanMode: audit.scanMode });
  return { auditId, status: "queued" };
}

