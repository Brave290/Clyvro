import { NextRequest, NextResponse } from "next/server";
import { createInvitation, revokeInvitation } from "@/lib/services/team";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";
import { INVITABLE_ROLES, type Role } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";
import { sendMail } from "@/lib/mail";
import { invitationEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

/** Creates an invitation, emails it immediately, and returns the link once as a fallback. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const role = String(body.role ?? "member") as Role;
    if (!(INVITABLE_ROLES as string[]).includes(role)) {
      throw new ScanError("VALIDATION", "Pick a role: admin, member, or viewer.");
    }
    const invite = await createInvitation(ctx.organizationId, ctx.userId, ctx.role, {
      email: String(body.email ?? ""),
      role,
    });
    const origin = new URL(req.url).origin;
    const url = `${origin}/invite/${invite.token}`;
    const delivery = await sendMail({
      to: invite.email,
      ...invitationEmail({
        organizationName: invite.organizationName,
        invitedBy: ctx.email || "A workspace administrator",
        role: invite.role,
        link: url,
      }),
    });
    return NextResponse.json({
      url,
      email: invite.email,
      role: invite.role,
      emailSent: delivery.sent,
      emailStatus: delivery.sent ? "sent" : delivery.reason,
    }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    await revokeInvitation(ctx.organizationId, String(body.invitationId ?? ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
