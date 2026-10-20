import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema";
import { apiError, readJsonBody, requireSession, ORG_COOKIE } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

/** Switches the active workspace. Membership is verified server-side; the cookie alone grants nothing. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = await readJsonBody(req);
    const target = String(body.organizationId ?? "");
    const db = await getDb();
    const [member] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organizationId, target), eq(memberships.userId, ctx.userId)))
      .limit(1);
    if (!member) throw new ScanError("NOT_FOUND", "Workspace not found.");
    const res = NextResponse.json({ ok: true, organizationId: target });
    res.cookies.set(ORG_COOKIE, target, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
