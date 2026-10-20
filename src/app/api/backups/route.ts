import { NextRequest, NextResponse } from "next/server";
import { createBackup, listBackups, r2Configured } from "@/lib/services/backups";
import { requireAdminUser } from "@/lib/services/admin";
import { apiError, readJsonBody, requireManage, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Backups & export (Cloudflare R2). GET: config state + catalogue. POST: create a backup. */
export async function GET() {
  try {
    const ctx = await requireSession();
    const isAdmin = await requireAdminUser(ctx.userId).then(() => true).catch(() => false);
    const backups = await listBackups(ctx.organizationId, isAdmin);
    return NextResponse.json({ configured: r2Configured(), isPlatformAdmin: isAdmin, backups });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireManage(ctx);
    const body = await readJsonBody(req);
    const scope = body.scope === "platform" ? "platform" : "workspace";
    const backup = await createBackup(ctx.organizationId, ctx.userId, scope);
    return NextResponse.json({ backup }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
