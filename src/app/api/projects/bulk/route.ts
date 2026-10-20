import { NextRequest, NextResponse } from "next/server";
import { deleteAllProjects } from "@/lib/services/audits";
import { apiError, readJsonBody, requireSession } from "@/lib/api";
import { canDeleteAllProjects } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";

const CONFIRMATION_PHRASE = "DELETE ALL PROJECTS";

/** Permanently removes project records and their audit trees for the active workspace. */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireSession();
    if (!canDeleteAllProjects(ctx.role)) {
      throw new ScanError("FORBIDDEN", "Only the workspace owner can delete all project data.");
    }

    const body = await readJsonBody(req);
    if (body.confirmation !== CONFIRMATION_PHRASE) {
      throw new ScanError("VALIDATION", `Type ${CONFIRMATION_PHRASE} to confirm this deletion.`);
    }

    const result = await deleteAllProjects(ctx.organizationId);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
