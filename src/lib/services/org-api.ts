import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { cliDeviceCodes, orgApiKeys, organizations } from "@/lib/db/schema";
import { effectivePlanForOrg, planAtLeast } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function planHasSiteApi(planId: string, planExpiresAt: Date | null): boolean {
  return planAtLeast(effectivePlanForOrg({ planId, planExpiresAt }), "pro");
}

export async function assertOrgHasSiteApi(organizationId: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org || !planHasSiteApi(org.planId, org.planExpiresAt)) {
    throw new ScanError("PLAN_LIMIT", "The Site API (Full Scan + Site Guard) is on the Pro and Agency plans.");
  }
}

async function countActive(organizationId: string, kind: string, db: DB) {
  const rows = await db.select({ id: orgApiKeys.id }).from(orgApiKeys)
    .where(and(eq(orgApiKeys.organizationId, organizationId), eq(orgApiKeys.kind, kind), isNull(orgApiKeys.revokedAt)));
  return rows.length;
}

export async function createOrgApiKey(
  organizationId: string, userId: string, name: string, dbOverride?: DB,
): Promise<{ id: string; prefix: string; secret: string }> {
  const db = dbOverride ?? (await getDb());
  await assertOrgHasSiteApi(organizationId, db);
  const trimmed = name.trim().slice(0, 80) || "API key";
  if (await countActive(organizationId, "secret", db) >= 5) {
    throw new ScanError("VALIDATION", "Each workspace can have 5 active API keys. Revoke one first.");
  }
  const secret = `cly_${randomBytes(24).toString("hex")}`;
  const id = newId();
  const prefix = secret.slice(0, 12);
  await db.insert(orgApiKeys).values({
    id, organizationId, name: trimmed, keyHash: sha256(secret), prefix, createdBy: userId, kind: "secret",
  });
  return { id, prefix, secret };
}

export async function createSiteKey(
  organizationId: string, userId: string, name: string, origins: string, dbOverride?: DB,
): Promise<{ id: string; prefix: string; secret: string; origins: string }> {
  const db = dbOverride ?? (await getDb());
  await assertOrgHasSiteApi(organizationId, db);
  const trimmed = name.trim().slice(0, 80) || "Site key";
  if (await countActive(organizationId, "site", db) >= 3) {
    throw new ScanError("VALIDATION", "Each workspace can have 3 site keys. Revoke one first.");
  }
  const hosts = origins.split(/[,\s]+/).map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean).slice(0, 10);
  if (hosts.length === 0) throw new ScanError("VALIDATION", "Add at least one hostname this site key may run on.");
  const secret = `clys_${randomBytes(24).toString("hex")}`;
  const id = newId();
  const prefix = secret.slice(0, 12);
  await db.insert(orgApiKeys).values({
    id, organizationId, name: trimmed, keyHash: sha256(secret), prefix, createdBy: userId,
    kind: "site", origins: hosts.join(","),
  });
  return { id, prefix, secret, origins: hosts.join(",") };
}

export async function listOrgApiKeys(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select({
    id: orgApiKeys.id, name: orgApiKeys.name, prefix: orgApiKeys.prefix,
    lastUsedAt: orgApiKeys.lastUsedAt, revokedAt: orgApiKeys.revokedAt, createdAt: orgApiKeys.createdAt,
    kind: orgApiKeys.kind, origins: orgApiKeys.origins,
  }).from(orgApiKeys).where(eq(orgApiKeys.organizationId, organizationId)).orderBy(desc(orgApiKeys.createdAt));
}

export async function revokeOrgApiKey(organizationId: string, id: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const updated = await db.update(orgApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(orgApiKeys.id, id), eq(orgApiKeys.organizationId, organizationId), isNull(orgApiKeys.revokedAt)))
    .returning();
  if (updated.length === 0) throw new ScanError("NOT_FOUND", "API key not found.");
}

export interface ApiKeyContext {
  organizationId: string;
  keyId: string;
  userId: string;
  planId: string;
  kind?: string;
}

async function orgContext(organizationId: string, db: DB) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org || !planHasSiteApi(org.planId, org.planExpiresAt)) {
    throw new ScanError("PLAN_LIMIT", "The Site API is on the Pro and Agency plans.");
  }
  return org;
}

export async function authenticateApiKey(header: string | null, dbOverride?: DB): Promise<ApiKeyContext> {
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    throw new ScanError("UNAUTHORIZED", "Send Authorization: Bearer cly_… (create a key under API & keys).");
  }
  const secret = header.slice(7).trim();
  const db = dbOverride ?? (await getDb());

  if (secret.startsWith("clycli_")) {
    const hash = sha256(secret);
    const [row] = await db.select().from(cliDeviceCodes).where(eq(cliDeviceCodes.tokenHash, hash)).limit(1);
    if (!row || row.status !== "consumed" || !row.organizationId || !row.userId) {
      throw new ScanError("UNAUTHORIZED", "That API key is not valid.");
    }
    if (row.expiresAt.getTime() < Date.now()) throw new ScanError("UNAUTHORIZED", "That CLI login has expired. Run clyvro login again.");
    const org = await orgContext(row.organizationId, db);
    return { organizationId: row.organizationId, keyId: row.id, userId: row.userId, planId: org.planId, kind: "cli" };
  }

  if (!secret.startsWith("cly_") || secret.length < 20 || secret.length > 120) {
    throw new ScanError("UNAUTHORIZED", "That API key is not valid.");
  }
  const hash = sha256(secret);
  const [row] = await db.select({
    id: orgApiKeys.id, organizationId: orgApiKeys.organizationId, keyHash: orgApiKeys.keyHash,
    revokedAt: orgApiKeys.revokedAt, createdBy: orgApiKeys.createdBy, kind: orgApiKeys.kind,
  }).from(orgApiKeys).where(eq(orgApiKeys.keyHash, hash)).limit(1);
  if (!row || row.revokedAt || row.kind === "site") throw new ScanError("UNAUTHORIZED", "That API key is not valid.");
  const a = Buffer.from(row.keyHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ScanError("UNAUTHORIZED", "That API key is not valid.");
  const org = await orgContext(row.organizationId, db);
  await db.update(orgApiKeys).set({ lastUsedAt: new Date() }).where(eq(orgApiKeys.id, row.id));
  return { organizationId: row.organizationId, keyId: row.id, userId: row.createdBy, planId: org.planId, kind: "secret" };
}

export async function authenticateSiteKey(secret: string, originHost: string | null, dbOverride?: DB): Promise<ApiKeyContext> {
  if (!secret.startsWith("clys_") || secret.length < 20 || secret.length > 140) {
    throw new ScanError("UNAUTHORIZED", "That site key is not valid.");
  }
  const db = dbOverride ?? (await getDb());
  const hash = sha256(secret);
  const [row] = await db.select().from(orgApiKeys).where(eq(orgApiKeys.keyHash, hash)).limit(1);
  if (!row || row.revokedAt || row.kind !== "site") throw new ScanError("UNAUTHORIZED", "That site key is not valid.");
  const allowed = (row.origins ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const host = (originHost ?? "").replace(/^www\./, "").toLowerCase();
  if (host && allowed.length && !allowed.some((h) => host === h.replace(/^www\./, "") || host.endsWith(`.${h.replace(/^www\./, "")}`))) {
    throw new ScanError("FORBIDDEN", "This site key is not allowed on that hostname.");
  }
  const org = await orgContext(row.organizationId, db);
  await db.update(orgApiKeys).set({ lastUsedAt: new Date() }).where(eq(orgApiKeys.id, row.id));
  return { organizationId: row.organizationId, keyId: row.id, userId: row.createdBy, planId: org.planId, kind: "site" };
}
