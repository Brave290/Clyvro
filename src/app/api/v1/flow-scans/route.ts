import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { createFlowScan, getFlowScan, listFlowScans, runFlowScan } from "@/lib/services/flow-scan";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    if (body.consent !== true) {
      throw new ScanError("CONSENT_REQUIRED", "Set consent: true only if you own this website or have permission.");
    }
    const url = typeof body.url === "string" ? body.url : "";
    const { id } = await createFlowScan(key.organizationId, key.userId, url);
    const wait = body.wait === true || req.nextUrl.searchParams.get("wait") === "1";
    if (wait) {
      await runFlowScan(key.organizationId, id);
      const row = await getFlowScan(key.organizationId, id);
      return NextResponse.json({ id, status: row.status, report: row.report, errorMessage: row.errorMessage }, { status: 201 });
    }
    void runFlowScan(key.organizationId, id).catch(() => undefined);
    return NextResponse.json({ id, status: "queued" }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const list = await listFlowScans(key.organizationId, 20);
    return NextResponse.json(list);
  } catch (err) {
    return apiError(err);
  }
}
