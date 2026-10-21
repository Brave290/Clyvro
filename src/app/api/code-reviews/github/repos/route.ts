import { NextRequest, NextResponse } from "next/server";
import { listAvailableRepos, registerRepo } from "@/lib/services/github-code-review";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Repos the connected bot installation can access (with registered flags). */
export async function GET() {
  try {
    const ctx = await requireSession();
    return NextResponse.json({ repos: await listAvailableRepos(ctx.organizationId) });
  } catch (err) {
    return apiError(err);
  }
}

/** Register one of those repos for whole-repo reviews. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    await registerRepo(ctx.organizationId, ctx.userId, typeof body.fullName === "string" ? body.fullName : "");
    return NextResponse.json({ registered: true }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
