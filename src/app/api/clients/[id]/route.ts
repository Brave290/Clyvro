import { NextRequest, NextResponse } from "next/server";
import { archiveClient, getClient, updateClient } from "@/lib/services/clients";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId } = await requireSession();
    const { id } = await params;
    return NextResponse.json({ client: await getClient(organizationId, id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const body = await readJsonBody(req);
    const client = await updateClient(ctx.organizationId, id, {
      name: String(body.name ?? ""),
      contactName: typeof body.contactName === "string" ? body.contactName : undefined,
      contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json({ client });
  } catch (err) {
    return apiError(err);
  }
}

/** Archives the client (projects stay, unassigned). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    await archiveClient(ctx.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
