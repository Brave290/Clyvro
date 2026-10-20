import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/services/orgs";
import { listProjects } from "@/lib/services/audits";
import { createScanSchedule, listScanSchedules, type ScheduleCadence } from "@/lib/services/schedules";
import { effectivePlan } from "@/lib/plans";
import { canManageOrg } from "@/lib/permissions";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    const [org, schedules, projects] = await Promise.all([
      getOrganization(ctx.organizationId),
      listScanSchedules(ctx.organizationId),
      listProjects(ctx.organizationId),
    ]);
    return NextResponse.json({
      schedules,
      projects: projects.filter((project) => !project.archivedAt).map(({ id, name, siteUrl }) => ({ id, name, siteUrl })),
      monitoring: effectivePlan(org.planId).monitoring,
      canManage: canManageOrg(ctx.role),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const cadence = body.cadence;
    if (cadence !== "daily" && cadence !== "weekly") throw new ScanError("VALIDATION", "Choose daily or weekly monitoring.");
    const schedule = await createScanSchedule(ctx.organizationId, ctx.userId, {
      projectId: typeof body.projectId === "string" ? body.projectId : "",
      cadence: cadence as ScheduleCadence,
      weekday: typeof body.weekday === "number" ? body.weekday : undefined,
      timeZone: typeof body.timeZone === "string" ? body.timeZone : "UTC",
      locale: body.locale,
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
