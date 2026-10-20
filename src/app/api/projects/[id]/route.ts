import { NextRequest, NextResponse } from "next/server";
import { assignProjectClient } from "@/lib/services/clients";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

/** Assigns (or clears) the client a project belongs to. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const body = await readJsonBody(req);
    const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
    return NextResponse.json(await assignProjectClient(ctx.organizationId, id, clientId));
  } catch (err) {
    return apiError(err);
  }
}
