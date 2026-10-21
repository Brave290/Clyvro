import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { featureRequests, featureRequestVotes, organizations, users } from "@/lib/db/schema";
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

/** Remove ONLY the caller's own upvote. Idempotent; returns the fresh count + state. */
export async function removeFeatureVote(
  organizationId: string, userId: string, requestId: string, dbOverride?: DB,
): Promise<{ votes: number; votedByMe: boolean }> {
  const db = dbOverride ?? (await getDb());
  void organizationId;
  const [req] = await db.select({ id: featureRequests.id }).from(featureRequests).where(eq(featureRequests.id, requestId)).limit(1);
  if (!req) throw new ScanError("NOT_FOUND", "That feature request no longer exists.");
  // Scoped to (requestId, caller's userId) — it can never touch anyone else's vote.
  await db.delete(featureRequestVotes)
    .where(and(eq(featureRequestVotes.requestId, requestId), eq(featureRequestVotes.userId, userId)));
  const [{ value }] = await db.select({ value: count() }).from(featureRequestVotes)
    .where(eq(featureRequestVotes.requestId, requestId));
  return { votes: value, votedByMe: false };
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
  const [req] = await db.select({
    id: featureRequests.id, title: featureRequests.title, status: featureRequests.status,
  }).from(featureRequests).where(eq(featureRequests.id, requestId)).limit(1);
  if (!req) throw new ScanError("NOT_FOUND", "That feature request no longer exists.");
  await db.update(featureRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(featureRequests.id, requestId));

  // Growth loop: when something ships, tell everyone who voted for it.
  // Best-effort — a notification hiccup never blocks the status change,
  // and delivery stays honest (the outbox only marks mail sent when
  // the worker actually sent it).
  if (status === "shipped" && req.status !== "shipped") {
    try {
      const voters = await db.select({ userId: featureRequestVotes.userId, email: users.email })
        .from(featureRequestVotes)
        .innerJoin(users, eq(users.id, featureRequestVotes.userId))
        .where(eq(featureRequestVotes.requestId, requestId));
      const { enqueueUserNotification } = await import("@/lib/services/notifications");
      for (const v of voters) {
        await enqueueUserNotification({
          userId: v.userId,
          category: "productNews",
          kind: "feature_shipped",
          toEmail: v.email,
          subject: `You asked, we shipped: ${req.title.slice(0, 80)}`,
          body: `The feature you upvoted (“${req.title}”) is now live in Clyvro. Thanks for steering the roadmap — open the Feature requests board in your workspace to see it, and keep voting on what's next.`,
          dedupeKey: `feature-shipped:${requestId}:${v.userId}`,
        }, db);
      }
    } catch { /* best-effort nudge */ }
  }
}

/** Top requests created in the last 30 days, by votes — the admin "what's hot" strip. */
export async function topRequestedThisMonth(
  dbOverride?: DB, limit = 3,
): Promise<{ id: string; title: string; votes: number }[]> {
  const db = dbOverride ?? (await getDb());
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.select({
    id: featureRequests.id,
    title: featureRequests.title,
    votes: sql<number>`count(${featureRequestVotes.userId})`,
  })
    .from(featureRequests)
    .leftJoin(featureRequestVotes, eq(featureRequestVotes.requestId, featureRequests.id))
    .where(gte(featureRequests.createdAt, since))
    .groupBy(featureRequests.id)
    .orderBy(desc(sql`count(${featureRequestVotes.userId})`), desc(featureRequests.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, title: r.title, votes: Number(r.votes) }));
}

export interface PublicFeatureRequest {
  id: string;
  title: string;
  details: string;
  category: string;
  status: FeatureStatus;
  votes: number;
  createdAt: string;
}

/**
 * Public roadmap view (no account needed): the same board users vote
 * on, ranked by upvotes. No workspace/user identity is exposed —
 * author labels stay inside the signed-in app. Voting itself still
 * requires an account (one vote per user, so rankings can't be
 * botted); the public page sends voters to sign in and back.
 */
export async function listFeatureRequestsPublic(dbOverride?: DB, limit = 50): Promise<PublicFeatureRequest[]> {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)).limit(200);
  if (!rows.length) return [];
  const voteRows = await db.select({ requestId: featureRequestVotes.requestId })
    .from(featureRequestVotes);
  const counts = new Map<string, number>();
  for (const v of voteRows) counts.set(v.requestId, (counts.get(v.requestId) ?? 0) + 1);
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      details: r.details,
      category: r.category,
      status: (FEATURE_STATUSES as readonly string[]).includes(r.status) ? (r.status as FeatureStatus) : "requested",
      votes: counts.get(r.id) ?? 0,
      createdAt: iso(r.createdAt),
    }))
    .sort((a, b) =>
      (b.votes - a.votes) ||
      (a.status === "shipped" ? 1 : 0) - (b.status === "shipped" ? 1 : 0) ||
      b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, Math.min(Math.max(limit, 1), 100));
}

export interface AdminFeatureRequestView extends FeatureRequestView {
  /** Admin-only context: which workspace asked (users never see this). */
  workspaceName: string;
}

/**
 * Platform-admin board view: every request with its upvote count,
 * sorted by votes (the roadmap signal), including the requesting
 * workspace's name. Non-admins are refused by requireAdminUser.
 */
export async function listFeatureRequestsForAdmin(
  userId: string, dbOverride?: DB,
): Promise<AdminFeatureRequestView[]> {
  const db = dbOverride ?? (await getDb());
  await requireAdminUser(userId, db);
  const rows = await db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)).limit(200);
  if (!rows.length) return [];
  const voteRows = await db.select({ requestId: featureRequestVotes.requestId, userId: featureRequestVotes.userId })
    .from(featureRequestVotes);
  const counts = new Map<string, number>();
  for (const v of voteRows) counts.set(v.requestId, (counts.get(v.requestId) ?? 0) + 1);
  const orgIds = [...new Set(rows.map((r) => r.organizationId))];
  const orgs = orgIds.length
    ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds))
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      details: r.details,
      category: r.category,
      status: (FEATURE_STATUSES as readonly string[]).includes(r.status) ? (r.status as FeatureStatus) : "requested",
      votes: counts.get(r.id) ?? 0,
      votedByMe: false,
      mine: false,
      authorLabel: orgName.get(r.organizationId) ?? "Unknown workspace",
      workspaceName: orgName.get(r.organizationId) ?? "Unknown workspace",
      createdAt: iso(r.createdAt),
    }))
    .sort((a, b) =>
      (b.votes - a.votes) ||
      (a.status === "shipped" ? 1 : 0) - (b.status === "shipped" ? 1 : 0) ||
      b.createdAt.localeCompare(a.createdAt),
    );
}

/** The requesting workspace's own requests (account view). */
export async function listOwnFeatureRequests(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select().from(featureRequests)
    .where(eq(featureRequests.organizationId, organizationId))
    .orderBy(desc(featureRequests.createdAt))
    .limit(50);
}
