import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, UnauthorizedError } from "@/lib/api";
import { mailConfigurationStatus, sendMail } from "@/lib/mail";
import { smtpTestEmail } from "@/lib/email/templates";
import { getDb } from "@/lib/db";
import { logAdmin, requireAdminUser } from "@/lib/services/admin";
import { recordDirectMail } from "@/lib/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminActor() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
  return requireAdminUser(session.user.id);
}

/** Safe readiness summary: no host, address, username, URL or credential is returned. */
export async function GET() {
  try {
    await adminActor();
    return NextResponse.json(mailConfigurationStatus());
  } catch (err) {
    return apiError(err);
  }
}

/** Sends one branded test email to the signed-in platform administrator only. */
export async function POST() {
  try {
    const actor = await adminActor();
    const status = mailConfigurationStatus();
    if (!status.configured) {
      return NextResponse.json({ sent: false, status, reason: "not-configured" }, { status: 503 });
    }

    const message = smtpTestEmail(new Date());
    const result = await sendMail({ to: actor.email, ...message });
    await recordDirectMail({ kind: "smtp_test", toEmail: actor.email, subject: message.subject, result, userId: actor.userId });
    try {
      const db = await getDb();
      await logAdmin(db, actor, "email.smtp_test", "email", undefined, { transport: status.transport, sent: result.sent });
    } catch {
      console.error("[mail] admin test audit log failed");
    }
    return NextResponse.json({
      sent: result.sent,
      to: actor.email,
      status,
      reason: result.sent ? undefined : result.reason,
      message: result.sent
        ? "The SMTP provider accepted the test message. Check the signed-in admin mailbox (including spam)."
        : "The SMTP provider did not accept the message. Check the listed variable names, provider credentials, sender authorization, and deployment logs.",
    }, { status: result.sent ? 200 : 502 });
  } catch (err) {
    return apiError(err);
  }
}
