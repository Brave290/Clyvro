import { NextResponse } from "next/server";
import { disconnectInstallation, getGithubConnection } from "@/lib/services/github-code-review";
import { apiError, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Code Reviewer bot connection status for this workspace. */
export async function GET() {
  try {
    const ctx = await requireSession();
    return NextResponse.json(await getGithubConnection(ctx.organizationId));
  } catch (err) {
    return apiError(err);
  }
}

/** Disconnect the GitHub installation (repos + saved reviews cascade away). */
export async function DELETE() {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    await disconnectInstallation(ctx.organizationId);
    return NextResponse.json({ disconnected: true });
  } catch (err) {
    return apiError(err);
  }
}
