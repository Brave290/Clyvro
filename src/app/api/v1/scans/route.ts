import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { createFullScan, getFullScan, listFullScans } from "@/lib/services/full-scan";
import { runFullScan } from "@/lib/services/full-scan";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Full Scan via API (Pro/Agency, unlimited). Starts a Full Scan — strict
 * security on verified domains, plus the other engines. Returns the id;
 * poll GET /api/v1/scans/:id or pass wait=1 to run in this request.
 */
export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    const url = typeof body.url === "string" ? body.url : "";
    if (!url.trim()) throw new ScanError("VALIDATION", "Send { url: \"https://your-site.com\" }.");
    const consent = body.consent === true;
    if (!consent) {
      throw new ScanError(
        "CONSENT_REQUIRED",
        "Set consent: true only if you own this website or have the owner's permission.",
      );
    }
    const { id } = await createFullScan(key.organizationId, key.userId, url);
    const wait = body.wait === true || req.nextUrl.searchParams.get("wait") === "1";
    if (wait) {
      await runFullScan(key.organizationId, id);
      const row = await getFullScan(key.organizationId, id);
      return NextResponse.json({ id, status: row.status, stages: row.stages }, { status: 201 });
    }
    // Fire-and-forget the run so the client can poll.
    void runFullScan(key.organizationId, id).catch(() => undefined);
    return NextResponse.json({ id, status: "queued" }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const list = await listFullScans(key.organizationId, 20);
    return NextResponse.json(list);
  } catch (err) {
    return apiError(err);
  }
}
