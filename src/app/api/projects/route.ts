import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/services/audits";
import { apiError, readJsonBody, requireSession } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { organizationId } = await requireSession();
    return NextResponse.json({ projects: await listProjects(organizationId) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, organizationId } = await requireSession();
    const body = await readJsonBody(req);
    const project = await createProject(organizationId, userId, {
      name: String(body.name ?? ""),
      siteUrl: String(body.siteUrl ?? ""),
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
