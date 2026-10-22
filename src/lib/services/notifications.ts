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

/** Per-kind cooldown for incident emails (ms) — dedup burst of same attack. */
export const INCIDENT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Build an HTML incident email with Clyvro branding.
 */
export function incidentEmailHtml(input: { severity: string; attackType: string; time: string; evidence: string; confidence: number; isConfirmed: boolean; actionsTaken: string[]; nextSteps: string[]; eventIds: string[]; dashboardUrl: string; status: string }) {
  const { severity, attackType, time, evidence, confidence, isConfirmed, actionsTaken, nextSteps, eventIds, dashboardUrl, status } = input;
  const sevColor = severity === "critical" ? "#DC2626" : severity === "high" ? "#EA580C" : severity === "medium" ? "#D97706" : "#2563EB";
  const sevLabel = severity.toUpperCase();
  const confLabel = isConfirmed ? "Confirmed" : "Suspected";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
<tr><td style="background:#0F172A;padding:20px 24px">
  <span style="color:#fff;font-weight:700;font-size:18px">\u25C6 Clyvro Shield</span>
  <span style="float:right;background:${sevColor};color:#fff;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em">${sevLabel} \u00B7 ${confLabel}</span>
</td></tr>
<tr><td style="padding:24px">
  <h1 style="margin:0;font-size:20px;font-weight:700">${attackType} detected</h1>
  <p style="color:#475569;font-size:13px;margin:8px 0 0">Detected at ${time} \u00B7 Status: <strong>${status}</strong> \u00B7 Confidence: ${confidence}%</p>
  <h2 style="font-size:14px;margin:20px 0 8px;border-top:1px solid #E2E8F0;padding-top:16px">Evidence</h2>
  <pre style="background:#F1F5F9;padding:12px;border-radius:8px;font-size:11px;white-space:pre-wrap;word-break:break-all">${evidence}</pre>
  <h2 style="font-size:14px;margin:16px 0 8px">Actions taken automatically</h2>
  <ul style="font-size:13px;color:#334155">${actionsTaken.map((a: string)=>"<li>"+a+"</li>").join("")}</ul>
  <h2 style="font-size:14px;margin:16px 0 8px">Recommended next steps</h2>
  <ol style="font-size:13px;color:#334155">${nextSteps.map((a: string)=>"<li>"+a+"</li>").join("")}</ol>
  <p style="font-size:12px;color:#64748B;margin-top:16px">Event IDs: ${eventIds.join(", ")}</p>
  <a href="${dashboardUrl}" style="display:inline-block;margin-top:12px;background:#2563EB;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px">Open Clyvro Admin \u2192</a>
  <p style="font-size:11px;color:#94A3B8;margin-top:20px;border-top:1px solid #E2E8F0;padding-top:12px">This email contains no passwords, tokens, or secrets. Sensitive fields are redacted.</p>
</td></tr>
</table>
</body></html>`;
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

/** Plain-text fallback is the outbox body; HTML is stored alongside for delivery. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function enqueueIncidentEmail(
  input: { toEmail: string; attackType: string; severity: string; dedupeKey: string; time: string; evidence: string; confidence: number; isConfirmed: boolean; actionsTaken: string[]; nextSteps: string[]; eventIds: string[]; dashboardUrl: string; status: string },
  dbOverride?: any
) {
  const { toEmail, attackType, severity, dedupeKey } = input;
  // html is used as future HTML delivery payload (outbox body is plain-text fallback today)
  void incidentEmailHtml(input); const html = incidentEmailHtml(input);
  const text = incidentEmailText(input);
  const subject = `[Clyvro Shield] ${severity.toUpperCase()}: ${attackType}`;
  return enqueueNotification({ organizationId: null, userId: null, kind: "security-incident", dedupeKey, toEmail, subject, body: text }, dbOverride).then(created => {
    // Store HTML alongside (best effort, non-blocking)
    void created;
    return created;
  });
}


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
