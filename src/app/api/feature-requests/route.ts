import { NextRequest, NextResponse } from "next/server";
import { createFeatureRequest, listFeatureRequests } from "@/lib/services/feature-requests";
import { tryConsumeUserAction } from "@/lib/services/abuse";
import { requireAdminUser } from "@/lib/services/admin";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** Feature-request board. GET: all requests (votes-sorted) + whether you're a platform admin. POST: submit. */
export async function GET() {
  try {
    const ctx = await requireSession();
    const [requests, isAdmin] = await Promise.all([
      listFeatureRequests(ctx.organizationId, ctx.userId),
      requireAdminUser(ctx.userId).then(() => true).catch(() => false),
    ]);
    return NextResponse.json({ requests, isPlatformAdmin: isAdmin });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    if (!(await tryConsumeUserAction("feature-request", ctx.userId, 10, 60 * 60 * 1000))) {
      throw new ScanError("RATE_LIMITED", "You've suggested a lot of features in the last hour — thanks! Try again shortly.");
    }
    const body = await readJsonBody(req);
    const request = await createFeatureRequest(ctx.organizationId, ctx.userId, body);
    return NextResponse.json({ request }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
