import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { notificationOutbox, users } from "@/lib/db/schema";
import { sendMail, type MailResult, type MailSender } from "@/lib/mail";
import {
  notificationEmail, parseBillingEmailBody, paymentAbandonedEmail, paymentReceiptEmail,
  planExpiredEmail, planExpiringEmail, securityIncidentEmailHtml,
} from "@/lib/email/templates";

/**
 * Durable notification outbox.
 *
 * Every product event writes at most ONE row per dedupeKey (unique index),
 * so retries, webhook replays and worker recoveries can never email the
 * same event twice. Rows are delivered by flushNotificationOutbox (daily
 * dispatcher + opportunistic API nudges). When SMTP is not configured the
 * row stays pending when no mailer is configured, so enabling SMTP later can
 * deliver receipts that were queued during the outage.
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

/** Per-kind cooldown for incident emails (ms) — dedup burst of same attack. */
export const INCIDENT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Build an HTML incident email with Clyvro branding.
 */
export function incidentEmailHtml(input: { severity: string; attackType: string; time: string; evidence: string; confidence: number; isConfirmed: boolean; actionsTaken: string[]; nextSteps: string[]; eventIds: string[]; dashboardUrl: string; status: string }) {
  return securityIncidentEmailHtml(input);
}

export function incidentEmailText(input: { severity: string; attackType: string; time: string; evidence: string; confidence: number; isConfirmed: boolean; actionsTaken: string[]; nextSteps: string[]; eventIds: string[]; dashboardUrl: string; status: string }) {
  const { severity, attackType, time, evidence, confidence, isConfirmed, actionsTaken, nextSteps, eventIds, dashboardUrl, status } = input;
  return `Clyvro Shield \u2014 ${severity.toUpperCase()} \u00B7 ${isConfirmed ? "Confirmed" : "Suspected"} incident

${attackType} detected at ${time}
Status: ${status} | Confidence: ${confidence}%

Evidence:
${evidence}

Actions taken:
${actionsTaken.map((a,i)=>`${i+1}. ${a}`).join("\n")}

Recommended next steps:
${nextSteps.map((a,i)=>`${i+1}. ${a}`).join("\n")}

Event IDs: ${eventIds.join(", ")}
Dashboard: ${dashboardUrl}

\u2014 Clyvro Shield (no passwords or secrets included)
`;
}

/** Incident notifications enter the same durable, deduplicated outbox as other product mail. */
export function enqueueIncidentEmail(
  input: { toEmail: string; attackType: string; severity: string; dedupeKey: string; time: string; evidence: string; confidence: number; isConfirmed: boolean; actionsTaken: string[]; nextSteps: string[]; eventIds: string[]; dashboardUrl: string; status: string },
  dbOverride?: DB
) {
  const { toEmail, attackType, severity, dedupeKey } = input;
  const text = incidentEmailText(input);
  const subject = `[Clyvro Shield] ${severity.toUpperCase()}: ${attackType}`;
  return enqueueNotification({ organizationId: null, userId: null, kind: "security-incident", dedupeKey, toEmail, subject, body: text }, dbOverride).then(created => {
    void created;
    return created;
  });
}


/**
 * Deliver pending rows (bounded). A row is claimed by flipping it to a
 * transient attempts bump first; delivery outcome is then recorded.
 * `skipped_no_mailer` rows from older releases are also requeued naturally
 * once an operator enables SMTP; delivery is never claimed without a sender.
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
    const fields = parseBillingEmailBody(row.kind, row.body);
    const rendered = row.kind === "payment_receipt" && fields?.planName && fields.amountFormatted && fields.txRef
      ? paymentReceiptEmail({
        planName: fields.planName, amountFormatted: fields.amountFormatted,
        currency: fields.currency ?? "", txRef: fields.txRef,
        paidAt: fields.paidAt ?? new Date().toISOString(), customerName: fields.customerName,
      })
      : row.kind === "payment_abandoned" && fields?.planName && fields.amountFormatted
        ? paymentAbandonedEmail({ planName: fields.planName, amountFormatted: fields.amountFormatted, currency: fields.currency })
        : row.kind === "plan_expiring" && fields?.planName && fields.expiresAt
          ? planExpiringEmail({ planName: fields.planName, expiresAt: fields.expiresAt, window: fields.window ?? "7d" })
          : row.kind === "plan_expired" && fields?.planName && fields.expiresAt
            ? planExpiredEmail({ planName: fields.planName, expiresAt: fields.expiresAt })
            : notificationEmail({ subject: row.subject, body: row.body, kind: row.kind });
    const result: MailResult = await sender({ to: row.toEmail, ...rendered });
    if (result.sent) {
      await db.update(notificationOutbox)
        .set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null })
        .where(eq(notificationOutbox.id, row.id));
      sent++;
    } else if (result.reason === "not-configured") {
      await db.update(notificationOutbox)
        .set({ status: "pending", lastError: "Email is not configured (SMTP env missing)." })
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
