import { NextRequest, NextResponse } from "next/server";
import { claimInstallation } from "@/lib/services/github-code-review";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Claim a GitHub installation for this workspace after the GitHub install redirect. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    await claimInstallation(
      ctx.organizationId, ctx.userId,
      typeof body.installationId === "string" ? body.installationId : "",
    );
    return NextResponse.json({ claimed: true }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
