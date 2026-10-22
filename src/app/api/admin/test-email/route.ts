import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, UnauthorizedError } from "@/lib/api";
import { requireAdminUser } from "@/lib/services/admin";
import { mailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-email
 * Body: { to?: string }
 * - Requires admin session (CLYVRO_ADMIN_EMAILS)
 * - Sends a test email via live SMTP env (SMTP_HOST etc. on Vercel)
 * - Returns {ok, configured, sent, to, from, reason?}
 * Used to verify SMTP after user updates Vercel envs.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
    const actor = await requireAdminUser(session.user.id);

    let to = actor.email;
    try {
      const body = await req.json();
      if (typeof body.to === "string" && body.to.includes("@")) to = body.to.trim();
    } catch {}

    const configured = mailConfigured();
    const from = process.env.EMAIL_FROM?.trim() || "Clyvro <no-reply@clyvro.app>";
    const smtpHost = process.env.SMTP_HOST || "";
    const smtpUser = process.env.SMTP_USER || "";

    if (!configured) {
      return NextResponse.json({
        ok: false,
        configured: false,
        sent: false,
        to,
        from,
        reason: "SMTP_HOST missing in Vercel env. Add SMTP_HOST/SMTP_USER/SMTP_PASS in Vercel → Settings → Environment Variables and redeploy.",
        smtpHost,
        smtpUser,
      });
    }

    const result = await sendMail({
      to,
      subject: "Clyvro — SMTP test successful ✓",
      text: `Hi ${actor.email},\n\nYour Clyvro SMTP is working!\n\nThis test was sent from clyvro.vercel.app using:\n- FROM: ${from}\n- SMTP: ${smtpHost} as ${smtpUser}\n- TO: ${to}\n- Time: ${new Date().toISOString()}\n\nIf you received this, password resets, invites and Shield alerts will deliver.\n\n— Clyvro`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">✅ Clyvro SMTP test successful</h2>
        <p>Hi <strong>${actor.email}</strong>,</p>
        <p>Your live SMTP on <strong>clyvro.vercel.app</strong> is working.</p>
        <table style="margin:12px 0;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px;color:#666">FROM</td><td style="padding:4px 12px"><code>${from}</code></td></tr>
          <tr><td style="padding:4px 12px;color:#666">SMTP</td><td style="padding:4px 12px"><code>${smtpHost}</code> as <code>${smtpUser}</code></td></tr>
          <tr><td style="padding:4px 12px;color:#666">TO</td><td style="padding:4px 12px"><code>${to}</code></td></tr>
          <tr><td style="padding:4px 12px;color:#666">Time</td><td style="padding:4px 12px">${new Date().toISOString()}</td></tr>
        </table>
        <p style="font-size:13px;color:#666">Password resets, invites and Shield alerts will now deliver.</p>
        <p>— Clyvro</p>
      </div>`,
    });

    return NextResponse.json({
      ok: result.sent,
      configured,
      sent: result.sent,
      to,
      from,
      smtpHost,
      smtpUser,
      reason: result.sent ? undefined : (result as any).reason || "send-failed — check Gmail App Password (16-char, no spaces) and ensure Less Secure Apps / 2FA App Password is used, not your normal password.",
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
    await requireAdminUser(session.user.id);
    return NextResponse.json({
      configured: mailConfigured(),
      smtpHost: process.env.SMTP_HOST || null,
      smtpPort: process.env.SMTP_PORT || null,
      smtpUser: process.env.SMTP_USER || null,
      smtpSecure: process.env.SMTP_SECURE || null,
      from: process.env.EMAIL_FROM || null,
      hasPass: Boolean(process.env.SMTP_PASS),
    });
  } catch (err) {
    return apiError(err);
  }
}
