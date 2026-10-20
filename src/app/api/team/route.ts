import { NextResponse } from "next/server";
import { listInvitations, listMembers } from "@/lib/services/team";
import { getOrganization } from "@/lib/services/orgs";
import { effectivePlan } from "@/lib/plans";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";

/** Members + invitations + seat usage for the team page. */
export async function GET() {
  try {
    const ctx = await requireSession();
    const [members, invitations, org] = await Promise.all([
      listMembers(ctx.organizationId),
      listInvitations(ctx.organizationId),
      getOrganization(ctx.organizationId),
    ]);
    const plan = effectivePlan(org.planId);
    const pending = invitations.filter((i) => !i.acceptedAt && !i.revokedAt);
    return NextResponse.json({
      members,
      invitations: pending,
      seats: { used: members.length, pending: pending.length, total: plan.teamSeats, planName: plan.name },
      myRole: ctx.role,
      myUserId: ctx.userId,
    });
  } catch (err) {
    return apiError(err);
  }
}
