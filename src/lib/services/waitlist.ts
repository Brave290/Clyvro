import { eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { waitlistSignups } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import { enqueueNotification } from "./notifications";
import { OWNER_EMAILS } from "./entitlements";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Waitlist signup, fully wired: persisted in Neon/Postgres and emailed —
 * a confirmation to the person who signed up and a notification to the
 * founder inbox (WAITLIST_NOTIFY_EMAIL, else the owner email). Delivery
 * goes through the durable outbox, so a mail outage queues rather than
 * loses signups, and dedupe keys make retries harmless. When SMTP isn't
 * configured the signup is still stored and the API says mail is pending
 * instead of claiming anything was sent.
 */
export async function joinWaitlist(
  input: { email: string; role?: string | null; source?: string },
  dbOverride?: DB,
): Promise<{ joined: boolean; alreadyJoined: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ScanError("VALIDATION", "Enter a valid email address.");
  const db = dbOverride ?? (await getDb());

  const [existing] = await db.select({ id: waitlistSignups.id }).from(waitlistSignups)
    .where(eq(waitlistSignups.email, email)).limit(1);
  if (existing) return { joined: false, alreadyJoined: true };

  await db.insert(waitlistSignups).values({
    id: newId(), email, role: input.role?.slice(0, 80) ?? null,
    source: (input.source ?? "homepage").slice(0, 40),
  });

  await enqueueNotification({
    kind: "waitlist_confirmation", dedupeKey: `waitlist-confirm:${email}`,
    toEmail: email,
    subject: "You're on the Clyvro waitlist",
    body: "Thanks for joining the Clyvro waitlist. We'll email this address when your early-access invite is ready. If you didn't sign up, you can ignore this message.",
  }, db);

  const notifyTo = process.env.WAITLIST_NOTIFY_EMAIL?.trim() || OWNER_EMAILS[0];
  if (notifyTo) {
    await enqueueNotification({
      kind: "waitlist_signup", dedupeKey: `waitlist-founder:${email}`,
      toEmail: notifyTo,
      subject: `New Clyvro waitlist signup: ${email}`,
      body: `A new waitlist signup arrived.\n\nEmail: ${email}\nRole: ${input.role ?? "—"}\nSource: ${input.source ?? "homepage"}`,
    }, db);
  }
  return { joined: true, alreadyJoined: false };
}
