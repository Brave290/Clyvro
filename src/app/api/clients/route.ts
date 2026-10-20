import { NextRequest, NextResponse } from "next/server";
import { createClient, listClients } from "@/lib/services/clients";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireSession();
    const search = req.nextUrl.searchParams.get("q") ?? undefined;
    const summaries = await listClients(organizationId, search);
    return NextResponse.json({
      clients: summaries.map((s) => ({
        ...s.client,
        projectCount: s.projectCount,
        latestAudit: s.latestAudit
          ? { ...s.latestAudit, createdAt: s.latestAudit.createdAt.toISOString() }
          : null,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const client = await createClient(ctx.organizationId, ctx.userId, {
      name: String(body.name ?? ""),
      contactName: typeof body.contactName === "string" ? body.contactName : undefined,
      contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
