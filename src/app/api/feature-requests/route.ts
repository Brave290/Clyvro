import { NextRequest, NextResponse } from "next/server";
import { createFeatureRequest, listFeatureRequests } from "@/lib/services/feature-requests";
import { requireAdminUser } from "@/lib/services/admin";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

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
    const body = await readJsonBody(req);
    const request = await createFeatureRequest(ctx.organizationId, ctx.userId, body);
    return NextResponse.json({ request }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
