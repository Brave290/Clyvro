import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createCronJob, listCronJobs, runDueCronJobs } from "@/lib/services/cron-jobs";
import { getOrganization } from "@/lib/services/orgs";
import {effectivePlanForOrg, } from "@/lib/plans";
import { canWrite } from "@/lib/permissions";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    const ctx = await requireSession();
    const [org, items] = await Promise.all([
      getOrganization(ctx.organizationId),
      listCronJobs(ctx.organizationId),
    ]);
    // Our scheduler is opportunistic: any workspace activity helps due
    // jobs fire on time, on top of the guaranteed daily dispatch.
    after(() => runDueCronJobs({ limit: 5 }));
    const plan = effectivePlanForOrg(org);
    return NextResponse.json({
      jobs: items,
      planName: plan.name,
      maxCronJobs: plan.maxCronJobs,
      canWrite: canWrite(ctx.role),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const { id } = await createCronJob(ctx.organizationId, ctx.userId, {
      name: typeof body.name === "string" ? body.name : "",
      url: typeof body.url === "string" ? body.url : "",
      method: typeof body.method === "string" ? body.method : "GET",
      body: typeof body.body === "string" ? body.body : null,
      intervalMinutes: typeof body.intervalMinutes === "number" ? body.intervalMinutes : 1440,
      firstRunAt: typeof body.firstRunAt === "string" ? body.firstRunAt : null,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
