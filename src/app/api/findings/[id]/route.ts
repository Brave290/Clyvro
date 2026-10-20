import { NextRequest, NextResponse } from "next/server";
import { setFindingStatus } from "@/lib/services/audits";
import { apiError, readJsonBody, requireSession } from "@/lib/api";
import { ScanError } from "@/lib/scanner/types";
import type { FindingStatus } from "@/lib/db/schema";

export const runtime = "nodejs";

const STATUSES: FindingStatus[] = ["open", "acknowledged", "dismissed"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId } = await requireSession();
    const { id } = await params;
    const body = await readJsonBody(req);
    const status = body.status as FindingStatus;
    if (!STATUSES.includes(status)) throw new ScanError("VALIDATION", "Invalid finding status.");
    return NextResponse.json(await setFindingStatus(organizationId, id, status));
  } catch (err) {
    return apiError(err);
  }
}
