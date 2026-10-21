import { and, count, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { featureRequests, featureRequestVotes } from "@/lib/db/schema";
import { requireAdminUser } from "@/lib/services/admin";
import { ScanError } from "@/lib/scanner/types";

/**
 * In-app feature requests: signed-in users suggest what Clyvro should
 * build next and upvote each other's requests. Statuses are set by
 * platform admins only and are honest lifecycle labels — "shipped" is
 * set when the feature is actually live (and lands in the changelog).
 */

export const FEATURE_CATEGORIES = ["scanner", "reports", "tools", "billing", "integrations", "other"] as const;
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export const FEATURE_STATUSES = ["requested", "planned", "in_progress", "shipped", "not_planned"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  requested: "Requested",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  not_planned: "Not planned",
};

export interface FeatureRequestView {
  id: string;
  title: string;
  details: string;
  category: string;
  status: FeatureStatus;
  votes: number;
  votedByMe: boolean;
  mine: boolean;
  /** "Your workspace" for own requests; other workspaces stay anonymous. */
  authorLabel: string;
  createdAt: string;
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));

export async function createFeatureRequest(
  organizationId: string, userId: string,
  input: { title?: unknown; details?: unknown; category?: unknown },
  dbOverride?: DB,
): Promise<FeatureRequestView> {
  const db = dbOverride ?? (await getDb());
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const category = typeof input.category === "string" && (FEATURE_CATEGORIES as readonly string[]).includes(input.category)
    ? input.category
    : "other";
  if (title.length < 4) throw new ScanError("VALIDATION", "Give your request a short, clear title (at least 4 characters).");
  if (title.length > 120) throw new ScanError("VALIDATION", "Keep the title under 120 characters — put the detail in the description.");
  if (details.length > 2000) throw new ScanError("VALIDATION", "Please keep the description under 2,000 characters.");
  const id = newId();
  await db.insert(featureRequests).values({ id, organizationId, userId, title, details, category, status: "requested" });
  // The requester automatically upvotes their own request.
  await db.insert(featureRequestVotes).values({ requestId: id, userId }).onConflictDoNothing();
  const [view] = await listFeatureRequests(organizationId, userId, db);
  return view.id === id ? view : {
    id, title, details, category, status: "requested", votes: 1, votedByMe: true,
    mine: true, authorLabel: "Your workspace", createdAt: new Date().toISOString(),
  };
}

export async function listFeatureRequests(
  organizationId: string, userId: string, dbOverride?: DB, limit = 100,
): Promise<FeatureRequestView[]> {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const voteRows = await db.select({ requestId: featureRequestVotes.requestId, userId: featureRequestVotes.userId })
    .from(featureRequestVotes);
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const v of voteRows) {
    if (!ids.includes(v.requestId)) continue;
    counts.set(v.requestId, (counts.get(v.requestId) ?? 0) + 1);
    if (v.userId === userId) mine.add(v.requestId);
  }
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      details: r.details,
      category: r.category,
      status: (FEATURE_STATUSES as readonly string[]).includes(r.status) ? (r.status as FeatureStatus) : "requested",
      votes: counts.get(r.id) ?? 0,
      votedByMe: mine.has(r.id),
      mine: r.organizationId === organizationId,
      authorLabel: r.organizationId === organizationId ? "Your workspace" : "Another workspace",
      createdAt: iso(r.createdAt),
    }))
    .sort((a, b) =>
      (b.votes - a.votes) ||
      (a.status === "shipped" ? 1 : 0) - (b.status === "shipped" ? 1 : 0) ||
      b.createdAt.localeCompare(a.createdAt),
    );
}

/** Toggle the caller's upvote. Returns the fresh count + state. */
export async function toggleFeatureVote(
  organizationId: string, userId: string, requestId: string, dbOverride?: DB,
): Promise<{ votes: number; votedByMe: boolean }> {
  const db = dbOverride ?? (await getDb());
  void organizationId;
  const [req] = await db.select({ id: featureRequests.id }).from(featureRequests).where(eq(featureRequests.id, requestId)).limit(1);
  if (!req) throw new ScanError("NOT_FOUND", "That feature request no longer exists.");
  const [existing] = await db.select().from(featureRequestVotes)
    .where(and(eq(featureRequestVotes.requestId, requestId), eq(featureRequestVotes.userId, userId)))
    .limit(1);
  if (existing) {
    await db.delete(featureRequestVotes)
      .where(and(eq(featureRequestVotes.requestId, requestId), eq(featureRequestVotes.userId, userId)));
  } else {
    await db.insert(featureRequestVotes).values({ requestId, userId }).onConflictDoNothing();
  }
  const [{ value }] = await db.select({ value: count() }).from(featureRequestVotes)
    .where(eq(featureRequestVotes.requestId, requestId));
  return { votes: value, votedByMe: !existing };
}

/** Platform-admin only: move a request through its lifecycle. */
export async function setFeatureStatus(
  userId: string, requestId: string, status: string, dbOverride?: DB,
): Promise<void> {
  const db = dbOverride ?? (await getDb());
  await requireAdminUser(userId, db);
  if (!(FEATURE_STATUSES as readonly string[]).includes(status)) {
    throw new ScanError("VALIDATION", "Unknown status.");
  }
  const [req] = await db.select({ id: featureRequests.id }).from(featureRequests).where(eq(featureRequests.id, requestId)).limit(1);
  if (!req) throw new ScanError("NOT_FOUND", "That feature request no longer exists.");
  await db.update(featureRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(featureRequests.id, requestId));
}

/** The requesting workspace's own requests (account view). */
export async function listOwnFeatureRequests(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select().from(featureRequests)
    .where(eq(featureRequests.organizationId, organizationId))
    .orderBy(desc(featureRequests.createdAt))
    .limit(50);
}
