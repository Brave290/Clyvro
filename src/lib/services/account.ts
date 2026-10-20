import { and, eq, ne } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import {
  audits, clients, cronJobs, invitations, memberships, organizations,
  payments, projects, readinessChecks, scanSchedules, shareTokens, users,
} from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import { isOwnerEmail } from "./entitlements";

/**
 * Account deletion (danger zone).
 *
 * Rules: the confirmation must match the account email exactly (typed
 * by the user). Workspaces where the user is the SOLE owner are deleted
 * with everything in them (cascade). If the user owns a workspace that
 * still has other members, deletion is refused — they must remove the
 * team first (ownership transfer isn't offered yet, and silently
 * orphaning a team would be worse). In workspaces where they're a
 * member/admin, their created records are reassigned to the workspace
 * owner so the team's history stays intact, then they leave.
 */

export interface AccountDeletionInfo {
  email: string;
  blockingOrgs: string[];
  soleOwnerOrgs: string[];
  memberOrgs: string[];
}

export async function accountDeletionInfo(userId: string, dbOverride?: DB): Promise<AccountDeletionInfo> {
  const db = dbOverride ?? (await getDb());
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ScanError("NOT_FOUND", "Account not found.");
  const mine = await db.select().from(memberships).where(eq(memberships.userId, userId));
  const blockingOrgs: string[] = [];
  const soleOwnerOrgs: string[] = [];
  const memberOrgs: string[] = [];
  for (const m of mine) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, m.organizationId)).limit(1);
    if (!org) continue;
    if (m.role === "owner") {
      const others = await db.select().from(memberships)
        .where(and(eq(memberships.organizationId, org.id), ne(memberships.userId, userId)));
      if (others.length > 0) blockingOrgs.push(org.name);
      else soleOwnerOrgs.push(org.name);
    } else {
      memberOrgs.push(org.name);
    }
  }
  return { email: user.email, blockingOrgs, soleOwnerOrgs, memberOrgs };
}

export async function deleteAccount(userId: string, confirmation: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const info = await accountDeletionInfo(userId, db);
  if (isOwnerEmail(info.email)) {
    throw new ScanError("FORBIDDEN", "The platform owner account can't be deleted.");
  }
  if (confirmation.trim().toLowerCase() !== info.email.toLowerCase()) {
    throw new ScanError("INVALID_INPUT", "Type your account email exactly to confirm deletion.");
  }
  if (info.blockingOrgs.length > 0) {
    throw new ScanError("CONFLICT",
      `You own ${info.blockingOrgs.join(", ")}, which still has other members. Remove the team from the Team page first, then delete your account.`);
  }

  const mine = await db.select().from(memberships).where(eq(memberships.userId, userId));
  for (const m of mine) {
    if (m.role === "owner") {
      // Sole-owner workspace: delete it wholesale (FK cascades clear the rest).
      await db.delete(organizations).where(eq(organizations.id, m.organizationId));
    } else {
      // Shared workspace: hand their records to the workspace owner.
      const [owner] = await db.select().from(memberships)
        .where(and(eq(memberships.organizationId, m.organizationId), eq(memberships.role, "owner")))
        .limit(1);
      const newOwnerId = owner?.userId;
      if (newOwnerId) {
        await db.update(projects).set({ createdBy: newOwnerId })
          .where(and(eq(projects.organizationId, m.organizationId), eq(projects.createdBy, userId)));
        await db.update(clients).set({ createdBy: newOwnerId })
          .where(and(eq(clients.organizationId, m.organizationId), eq(clients.createdBy, userId)));
        await db.update(audits).set({ requestedBy: newOwnerId })
          .where(and(eq(audits.organizationId, m.organizationId), eq(audits.requestedBy, userId)));
        await db.update(shareTokens).set({ createdBy: newOwnerId })
          .where(and(eq(shareTokens.organizationId, m.organizationId), eq(shareTokens.createdBy, userId)));
        await db.update(scanSchedules).set({ createdBy: newOwnerId })
          .where(and(eq(scanSchedules.organizationId, m.organizationId), eq(scanSchedules.createdBy, userId)));
        await db.update(payments).set({ userId: newOwnerId })
          .where(and(eq(payments.organizationId, m.organizationId), eq(payments.userId, userId)));
        await db.update(cronJobs).set({ createdBy: newOwnerId })
          .where(and(eq(cronJobs.organizationId, m.organizationId), eq(cronJobs.createdBy, userId)));
        await db.update(readinessChecks).set({ requestedBy: newOwnerId })
          .where(and(eq(readinessChecks.organizationId, m.organizationId), eq(readinessChecks.requestedBy, userId)));
      }
      await db.delete(memberships).where(and(eq(memberships.organizationId, m.organizationId), eq(memberships.userId, userId)));
    }
  }
  // Invitations they sent vanish; ones they accepted lose the attribution.
  await db.delete(invitations).where(eq(invitations.invitedBy, userId));
  await db.update(invitations).set({ acceptedBy: null }).where(eq(invitations.acceptedBy, userId));
  // Accounts/sessions/password-reset rows cascade from users.
  await db.delete(users).where(eq(users.id, userId));
}
