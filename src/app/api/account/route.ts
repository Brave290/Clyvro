import { NextRequest, NextResponse } from "next/server";
import { accountDeletionInfo, deleteAccount } from "@/lib/services/account";
import { apiError, readJsonBody, requireSession } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    const info = await accountDeletionInfo(ctx.userId);
    return NextResponse.json(info);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = await readJsonBody(req);
    await deleteAccount(ctx.userId, typeof body.confirmation === "string" ? body.confirmation : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
