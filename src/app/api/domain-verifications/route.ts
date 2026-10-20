import { NextResponse } from "next/server";
import { apiError, readJsonBody, requireSession, requireWrite } from "@/lib/api";
import { issueDomainVerification, listDomainVerifications } from "@/lib/services/domain-verification";

export const runtime = "nodejs";

/** The signed-in workspace's domain verifications (never token hashes). */
export async function GET() {
  try {
    const { organizationId } = await requireSession();
    return NextResponse.json({ verifications: await listDomainVerifications(organizationId) });
  } catch (err) {
    return apiError(err);
  }
}

/** Issue (or re-issue) a DNS TXT verification token for a domain. */
export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const body = await readJsonBody(req, 4_096);
    const domain = typeof body.domain === "string" ? body.domain : typeof body.url === "string" ? body.url : "";
    const issued = await issueDomainVerification(ctx.organizationId, ctx.userId, domain);
    return NextResponse.json({ verification: issued }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
