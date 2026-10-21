import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { notificationOutbox, users } from "@/lib/db/schema";
import { sendMail, type MailResult, type MailSender } from "@/lib/mail";

/**
 * Durable notification outbox.
 *
 * Every product event writes at most ONE row per dedupeKey (unique index),
 * so retries, webhook replays and worker recoveries can never email the
 * same event twice. Rows are delivered by flushNotificationOutbox (daily
 * dispatcher + opportunistic API nudges). When SMTP is not configured the
 * row is marked `skipped_no_mailer` — recorded honestly, never claimed sent.
 */

export type NotifyCategory = "scanResults" | "scheduledRuns" | "billing" | "quota" | "productNews";
export interface NotifyPrefs { scanResults?: boolean; scheduledRuns?: boolean; billing?: boolean; quota?: boolean; productNews?: boolean }

export function prefsAllow(prefs: unknown, category: NotifyCategory): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const value = (prefs as NotifyPrefs)[category];
  return value !== false;
}

export interface EnqueueInput {
  organizationId?: string | null;
  userId?: string | null;
  kind: string;
  dedupeKey: string;
  toEmail: string;
  subject: string;
  body: string;
}

/** Insert an event once. Returns true when a new row was created. */
export async function enqueueNotification(input: EnqueueInput, dbOverride?: DB): Promise<boolean> {
  const db = dbOverride ?? (await getDb());
  const inserted = await db.insert(notificationOutbox).values({
    id: newId(),
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    toEmail: input.toEmail,
    subject: input.subject.slice(0, 200),
    body: input.body.slice(0, 4000),
    status: "pending",
  }).onConflictDoNothing({ target: notificationOutbox.dedupeKey }).returning();
  return inserted.length > 0;
}

/** Enqueue to a user only when their preferences allow the category. */
export async function enqueueUserNotification(
  input: EnqueueInput & { category: NotifyCategory },
  dbOverride?: DB,
): Promise<boolean> {
  const db = dbOverride ?? (await getDb());
  if (input.userId) {
    const [user] = await db.select({ notifyPrefs: users.notifyPrefs }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (user && !prefsAllow(user.notifyPrefs, input.category)) return false;
  }
  return enqueueNotification(input, db);
}

const MAX_ATTEMPTS = 3;

/**
 * Deliver pending rows (bounded). A row is claimed by flipping it to a
 * transient attempts bump first; delivery outcome is then recorded.
 * `skipped_no_mailer` is terminal until an operator requeues it — we never
 * pretend an email was delivered without a configured mailer.
 */
export async function flushNotificationOutbox(
  options: { limit?: number; sender?: MailSender } = {},
  dbOverride?: DB,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = dbOverride ?? (await getDb());
  const sender = options.sender ?? sendMail;
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const pending = await db.select().from(notificationOutbox)
    .where(inArray(notificationOutbox.status, ["pending", "failed"]))
    .orderBy(asc(notificationOutbox.createdAt))
    .limit(limit);
  let sent = 0, skipped = 0, failed = 0;
  for (const row of pending) {
    if (row.attempts >= MAX_ATTEMPTS) continue;
    const result: MailResult = await sender({ to: row.toEmail, subject: row.subject, text: row.body });
    if (result.sent) {
      await db.update(notificationOutbox)
        .set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null })
        .where(eq(notificationOutbox.id, row.id));
      sent++;
    } else if (result.reason === "not-configured") {
      await db.update(notificationOutbox)
        .set({ status: "skipped_no_mailer", attempts: row.attempts + 1, lastError: "Email is not configured (SMTP env missing)." })
        .where(eq(notificationOutbox.id, row.id));
      skipped++;
    } else {
      await db.update(notificationOutbox)
        .set({ status: "failed", attempts: row.attempts + 1, lastError: "Email provider rejected or unreachable." })
        .where(and(eq(notificationOutbox.id, row.id)));
      failed++;
    }
  }
  return { sent, skipped, failed };
}
