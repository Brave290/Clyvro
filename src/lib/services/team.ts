import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, count } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { invitations, memberships, organizations, users } from "@/lib/db/schema";
import { effectivePlan } from "@/lib/plans";
import { normalizeRole, type Role } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";

/**
 * Team membership & invitations (Phase 4).
 * Invites are copy-link based (no email sending exists yet — we never
 * pretend an email was sent). Tokens: 256-bit, hash-only storage,
 * 7-day expiry, single-use, and the accepting account's email must
 * match the invited email. Seat limits come from the org's plan.
 */

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function orgOrThrow(db: DB, organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  return org;
}

async function seatUsage(db: DB, organizationId: string) {
  const [members, pending] = await Promise.all([
    db.select({ value: count() }).from(memberships).where(eq(memberships.organizationId, organizationId)).then((r) => r[0].value),
    db.select({ value: count() }).from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .then((r) => r[0].value),
  ]);
  return { members, pending };
}

export async function listMembers(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const rows = await db
    .select({ userId: memberships.userId, role: memberships.role, joinedAt: memberships.createdAt, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId));
  return rows.map((r) => ({ ...r, role: normalizeRole(r.role) }));
}

export async function createInvitation(
  organizationId: string, actorId: string, actorRole: Role,
  input: { email: string; role: Role },
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const org = await orgOrThrow(db, organizationId);
  const plan = effectivePlan(org.planId);

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ScanError("VALIDATION", "Enter a valid email address.");
  if (input.role === "owner") throw new ScanError("FORBIDDEN", "Ownership can't be given by invitation.");
  if (input.role === "admin" && actorRole !== "owner") {
    throw new ScanError("FORBIDDEN", "Only the owner can invite admins.");
  }

  const { members, pending } = await seatUsage(db, organizationId);
  if (members + pending >= plan.teamSeats) {
    throw new ScanError(
      "PLAN_LIMIT",
      `The ${plan.name} plan includes ${plan.teamSeats} seat${plan.teamSeats === 1 ? "" : "s"} and they're all in use (counting pending invites). See Pricing for plans with more seats.`,
    );
  }

  // Don't invite someone who is already in.
  const existingMember = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(users.email, email)))
    .limit(1);
  if (existingMember.length) throw new ScanError("VALIDATION", "That person is already a member of this workspace.");

  const raw = randomBytes(32).toString("base64url");
  const id = newId();
  await db.insert(invitations).values({
    id, organizationId, email, role: input.role, tokenHash: sha256(raw),
    invitedBy: actorId, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return { id, token: raw, email, role: input.role };
}

export async function listInvitations(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db
    .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt, createdAt: invitations.createdAt })
    .from(invitations)
    .where(eq(invitations.organizationId, organizationId))
    .orderBy(desc(invitations.createdAt));
}

export async function revokeInvitation(organizationId: string, invitationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
  if (!row || row.organizationId !== organizationId) throw new ScanError("NOT_FOUND", "Invitation not found.");
  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, invitationId));
}

/** Public-safe invite preview (org name + invited email only). Null for any invalid state. */
export async function getInvitationPreview(rawToken: string, dbOverride?: DB) {
  if (!rawToken || rawToken.length < 20) return null;
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(invitations).where(eq(invitations.tokenHash, sha256(rawToken))).limit(1);
  if (!row || row.revokedAt || row.acceptedAt || row.expiresAt.getTime() < Date.now()) return null;
  const org = await orgOrThrow(db, row.organizationId).catch(() => null);
  if (!org) return null;
  return { organizationId: org.id, organizationName: org.name, email: row.email, role: normalizeRole(row.role) };
}

export async function acceptInvitation(userId: string, userEmail: string, rawToken: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(invitations).where(eq(invitations.tokenHash, sha256(rawToken))).limit(1);
  if (!row || row.revokedAt || row.acceptedAt || row.expiresAt.getTime() < Date.now()) {
    throw new ScanError("NOT_FOUND", "This invitation isn't valid anymore. Ask for a fresh one.");
  }
  if (row.email !== userEmail.trim().toLowerCase()) {
    throw new ScanError("FORBIDDEN", `This invitation was sent to ${row.email}. Sign in with that account to accept it.`);
  }
  const org = await orgOrThrow(db, row.organizationId);
  const plan = effectivePlan(org.planId);
  const { members } = await seatUsage(db, row.organizationId);

  const [already] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, row.organizationId), eq(memberships.userId, userId)))
    .limit(1);
  if (!already && members >= plan.teamSeats) {
    throw new ScanError("PLAN_LIMIT", `This workspace has used all ${plan.teamSeats} seats on its ${plan.name} plan.`);
  }

  await db.transaction(async (tx) => {
    if (!already) {
      await tx.insert(memberships).values({ organizationId: row.organizationId, userId, role: normalizeRole(row.role) });
    }
    await tx.update(invitations).set({ acceptedAt: new Date(), acceptedBy: userId }).where(eq(invitations.id, row.id));
  });
  return { organizationId: row.organizationId, organizationName: org.name };
}

async function ownerCount(db: DB, organizationId: string) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "owner")));
  return value;
}

export async function changeMemberRole(
  organizationId: string, actorId: string, actorRole: Role, targetUserId: string, newRole: Role, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const [target] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, targetUserId)))
    .limit(1);
  if (!target) throw new ScanError("NOT_FOUND", "Member not found.");
  const targetRole = normalizeRole(target.role);

  if (actorRole !== "owner") {
    // Admins manage members/viewers only; never owners/admins, never grant admin.
    if (targetRole === "owner" || targetRole === "admin" || newRole === "admin" || newRole === "owner") {
      throw new ScanError("FORBIDDEN", "Only the owner can change admin or owner roles.");
    }
  }
  if (targetRole === "owner" && newRole !== "owner" && (await ownerCount(db, organizationId)) <= 1) {
    throw new ScanError("FORBIDDEN", "A workspace must keep at least one owner.");
  }
  if (actorId === targetUserId && actorRole === "owner" && newRole !== "owner") {
    throw new ScanError("FORBIDDEN", "You can't demote yourself. Ask another owner.");
  }
  await db.update(memberships).set({ role: newRole })
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, targetUserId)));
  return { userId: targetUserId, role: newRole };
}

export async function removeMember(
  organizationId: string, actorId: string, actorRole: Role, targetUserId: string, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const [target] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, targetUserId)))
    .limit(1);
  if (!target) throw new ScanError("NOT_FOUND", "Member not found.");
  const targetRole = normalizeRole(target.role);
  if (targetRole === "owner") {
    throw new ScanError("FORBIDDEN", "Owners can't be removed. Transfer or demote ownership first.");
  }
  if (actorRole !== "owner" && targetRole === "admin") {
    throw new ScanError("FORBIDDEN", "Only the owner can remove an admin.");
  }
  if (actorId === targetUserId) throw new ScanError("FORBIDDEN", "You can't remove yourself here.");
  await db.delete(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, targetUserId)));
}
