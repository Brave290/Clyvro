import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, readJsonBody, requireSession } from "@/lib/api";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { NotifyPrefs } from "@/lib/services/notifications";

export const runtime = "nodejs";

const DEFAULTS: Required<NotifyPrefs> = { scanResults: true, scheduledRuns: true, billing: true, quota: true, productNews: true };

/** Per-user email notification preferences (defaults: everything on). */
export async function GET() {
  try {
    const ctx = await requireSession();
    const db = await getDb();
    const [user] = await db.select({ notifyPrefs: users.notifyPrefs }).from(users).where(eq(users.id, ctx.userId)).limit(1);
    return NextResponse.json({ preferences: { ...DEFAULTS, ...((user?.notifyPrefs as NotifyPrefs | null) ?? {}) } });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJsonBody(req, 4_096);
    const prefs: NotifyPrefs = {};
    for (const key of ["scanResults", "scheduledRuns", "billing", "quota"] as const) {
      if (typeof body[key] === "boolean") prefs[key] = body[key];
    }
    const db = await getDb();
    await db.update(users).set({ notifyPrefs: prefs }).where(eq(users.id, ctx.userId));
    return NextResponse.json({ preferences: { ...DEFAULTS, ...prefs } });
  } catch (err) {
    return apiError(err);
  }
}
