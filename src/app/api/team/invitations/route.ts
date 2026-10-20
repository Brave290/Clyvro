import { NextRequest, NextResponse } from "next/server";
import { createInvitation, revokeInvitation } from "@/lib/services/team";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";
import { INVITABLE_ROLES, type Role } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** Creates an invitation. The raw token/link is returned exactly once (no email is sent). */
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
    return NextResponse.json({ url: `${origin}/invite/${invite.token}`, email: invite.email, role: invite.role }, { status: 201 });
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
