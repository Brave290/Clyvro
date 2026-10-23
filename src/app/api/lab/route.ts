import { NextRequest, NextResponse } from "next/server";
import { labAccess, labCatalog, runLabProbe } from "@/lib/services/lab";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const access = await labAccess(ctx.organizationId);
    return NextResponse.json({ access, catalog: access.allowed ? labCatalog(q) : [] });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req);
    const result = await runLabProbe(ctx.organizationId, ctx.userId, {
      url: typeof body.url === "string" ? body.url : "",
      path: typeof body.path === "string" ? body.path : "/",
      method: body.method,
      ownsOrAuthorized: body.ownsOrAuthorized === true,
      acceptLogs: body.acceptLogs === true,
      noThirdPartyAttack: body.noThirdPartyAttack === true,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return apiError(err);
  }
}
