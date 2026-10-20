import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiError, UnauthorizedError } from "@/lib/api";
import {
  listAdminJobs, listAdminLog, listAdminOrgs, listAdminUsers, requireAdminUser,
} from "@/lib/services/admin";
import { getLegalRow, LEGAL_SLUGS } from "@/lib/services/legal";

export const runtime = "nodejs";

/** Admin Control Center data. Server-side admin authorization on every call. */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
    await requireAdminUser(session.user.id);
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const [users, orgs, jobs, log, legal] = await Promise.all([
      listAdminUsers(q), listAdminOrgs(), listAdminJobs(), listAdminLog(),
      Promise.all(LEGAL_SLUGS.map(async (slug) => {
        const row = await getLegalRow(slug);
        return {
          slug, title: row?.title ?? slug, draftBody: row?.draftBody ?? "",
          published: Boolean(row?.publishedBody), publishedAt: row?.publishedAt?.toISOString() ?? null,
          revisions: Array.isArray(row?.revisions) ? (row.revisions as unknown[]).length : 0,
        };
      })),
    ]);
    return NextResponse.json({ users, orgs, jobs, log, legal });
  } catch (err) {
    return apiError(err);
  }
}
