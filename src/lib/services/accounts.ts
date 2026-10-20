import { eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { memberships, organizations, users } from "@/lib/db/schema";
import { hashPassword, passwordProblem } from "@/lib/passwords";
import { ScanError } from "@/lib/scanner/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface RegisterInput {
  name?: string;
  email: string;
  password: string;
  organizationName?: string;
}

/** Creates user + personal organization + owner membership atomically. */
export async function registerAccount(input: RegisterInput, dbOverride?: DB) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ScanError("VALIDATION", "Enter a valid email address.");
  const problem = passwordProblem(input.password);
  if (problem) throw new ScanError("VALIDATION", problem);
  const name = input.name?.trim() || null;

  const db = dbOverride ?? (await getDb());
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ScanError("EMAIL_TAKEN", "An account with this email already exists. Sign in instead.");

  const userId = newId();
  const orgId = newId();
  const orgName =
    input.organizationName?.trim() ||
    (name ? `${name}'s workspace` : "My workspace");

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email, name, passwordHash: hashPassword(input.password) });
    await tx.insert(organizations).values({ id: orgId, name: orgName, planId: "freemium" });
    await tx.insert(memberships).values({ organizationId: orgId, userId, role: "owner" });
  });
  return { userId, organizationId: orgId };
}

/** Returns the user's organizations (id + role). */
export async function organizationsForUser(userId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db
    .select({ organizationId: memberships.organizationId, role: memberships.role, name: organizations.name, planId: organizations.planId })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
}
