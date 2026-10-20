import { NextRequest, NextResponse } from "next/server";
import { getOrganization, updateBranding } from "@/lib/services/orgs";
import { effectivePlan } from "@/lib/plans";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    const org = await getOrganization(ctx.organizationId);
    const plan = effectivePlan(org.planId, org.planExpiresAt);
    return NextResponse.json({
      organization: { id: org.id, name: org.name, planId: org.planId, brandName: org.brandName, brandColor: org.brandColor, reportFooter: org.reportFooter },
      whiteLabel: plan.whiteLabel,
      planName: plan.name,
      myRole: ctx.role,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const org = await updateBranding(ctx.organizationId, {
      brandName: typeof body.brandName === "string" ? body.brandName : undefined,
      brandColor: typeof body.brandColor === "string" ? body.brandColor : undefined,
      reportFooter: typeof body.reportFooter === "string" ? body.reportFooter : undefined,
    });
    return NextResponse.json({
      organization: { id: org.id, name: org.name, brandName: org.brandName, brandColor: org.brandColor, reportFooter: org.reportFooter },
    });
  } catch (err) {
    return apiError(err);
  }
}
