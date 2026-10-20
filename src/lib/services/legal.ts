import { eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { adminAuditLog, legalPages } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";

/**
 * Editable legal pages (refund policy first-class; privacy/terms can be
 * overridden the same way). Draft and published bodies are separate:
 * editing a draft never changes the public page until an admin publishes.
 * Every publish keeps a bounded revision history. Content is plain text
 * (paragraphs), rendered escaped — there is no HTML injection surface.
 */

export const LEGAL_SLUGS = ["refund", "privacy", "terms"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const DEFAULT_REFUND_POLICY = `How Clyvro billing works
Clyvro plans are paid in advance for a 30-day period. When a payment is verified, the plan runs for 30 days from the purchase (or from the end of your current paid period when you renew the same plan). Plans do not renew automatically: when a paid period ends and no new payment is made, the workspace returns to the free Freemium plan. We never charge a stored card on our own.

Refunds for a started period
Because a paid period starts delivering scans, limits, and features immediately, payments are generally non-refundable once a billing period has begun. Asking for a refund does not affect your access for the period you already paid for — it runs to its scheduled end either way.

When we will refund
We always make things right for: duplicate charges for the same period; charges caused by a billing error on our side; and unauthorized transactions (report these promptly so we can investigate and secure the account). Nothing in this policy removes any refund or consumer rights you have under applicable law.

Cancelling
There is nothing to cancel mid-period: your plan simply ends when the 30 days run out unless you buy another period. You will not be charged again automatically.

Requesting support
If you believe you were charged incorrectly, contact support through the channel shown on your payment receipt, quoting the payment reference. We aim to respond within two business days.`;

export function sanitizeLegalText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, 60_000);
}

export async function getLegalRow(slug: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(legalPages).where(eq(legalPages.slug, slug)).limit(1);
  return row ?? null;
}

/** Public read: published body only. Refund falls back to the built-in policy. */
export async function getPublishedLegal(slug: LegalSlug, dbOverride?: DB): Promise<{ title: string; body: string; publishedAt: string | null }> {
  try {
    const row = await getLegalRow(slug, dbOverride);
    if (row?.publishedBody) {
      return { title: row.title, body: row.publishedBody, publishedAt: row.publishedAt?.toISOString() ?? null };
    }
  } catch { /* DB unavailable (e.g. build) — fall through to defaults */ }
  if (slug === "refund") return { title: "Refund policy", body: DEFAULT_REFUND_POLICY, publishedAt: null };
  return { title: slug === "privacy" ? "Privacy policy" : "Terms of service", body: "", publishedAt: null };
}

export async function saveLegalDraft(
  actorEmail: string,
  input: { slug: string; title: string; body: string },
  dbOverride?: DB,
) {
  if (!(LEGAL_SLUGS as readonly string[]).includes(input.slug)) throw new ScanError("VALIDATION", "Unknown legal page.");
  const db = dbOverride ?? (await getDb());
  const title = sanitizeLegalText(input.title).slice(0, 120) || "Legal page";
  const body = sanitizeLegalText(input.body);
  const existing = await getLegalRow(input.slug, db);
  if (existing) {
    await db.update(legalPages).set({ title, draftBody: body, updatedBy: actorEmail, updatedAt: new Date() })
      .where(eq(legalPages.id, existing.id));
  } else {
    await db.insert(legalPages).values({ id: newId(), slug: input.slug, title, draftBody: body, updatedBy: actorEmail });
  }
  await db.insert(adminAuditLog).values({
    id: newId(), actorEmail, action: "legal.draft_saved", targetType: "legal_page", targetId: input.slug,
    detail: { title },
  });
  return { slug: input.slug, saved: true };
}

export async function publishLegal(actorEmail: string, slug: string, dbOverride?: DB) {
  if (!(LEGAL_SLUGS as readonly string[]).includes(slug)) throw new ScanError("VALIDATION", "Unknown legal page.");
  const db = dbOverride ?? (await getDb());
  const row = await getLegalRow(slug, db);
  if (!row || !row.draftBody.trim()) throw new ScanError("VALIDATION", "Save a draft before publishing.");
  const revisions = Array.isArray(row.revisions) ? [...(row.revisions as unknown[])] : [];
  if (row.publishedBody) {
    revisions.unshift({ body: row.publishedBody, title: row.title, publishedAt: row.publishedAt?.toISOString() ?? null, byEmail: actorEmail });
  }
  await db.update(legalPages).set({
    publishedBody: row.draftBody, publishedAt: new Date(),
    revisions: revisions.slice(0, 20), updatedBy: actorEmail, updatedAt: new Date(),
  }).where(eq(legalPages.id, row.id));
  await db.insert(adminAuditLog).values({
    id: newId(), actorEmail, action: "legal.published", targetType: "legal_page", targetId: slug, detail: {},
  });
  return { slug, published: true };
}
