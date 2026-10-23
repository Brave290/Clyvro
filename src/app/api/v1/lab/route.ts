import { NextRequest, NextResponse } from "next/server";
import { apiError, readJsonBody } from "@/lib/api";
import { authenticateApiKey } from "@/lib/services/org-api";
import { runLabProbe } from "@/lib/services/lab";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const key = await authenticateApiKey(req.headers.get("authorization"));
    const body = await readJsonBody(req);
    const result = await runLabProbe(key.organizationId, key.userId, {
      url: typeof body.url === "string" ? body.url : "",
      path: typeof body.path === "string" ? body.path : "/",
      method: body.method,
      ownsOrAuthorized: body.ownsOrAuthorized === true || body.consent === true,
      acceptLogs: body.acceptLogs === true || body.consent === true,
      noThirdPartyAttack: body.noThirdPartyAttack === true || body.consent === true,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return apiError(err);
  }
}
