import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    return NextResponse.json({
      organizationId: key.organizationId,
      planId: key.planId,
      kind: key.kind ?? "secret",
    });
  } catch (err) {
    return apiError(err);
  }
}
