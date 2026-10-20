import { NextResponse } from "next/server";
import { apiError, requireSession, requireWrite } from "@/lib/api";
import { checkDomainVerification } from "@/lib/services/domain-verification";

export const runtime = "nodejs";

/** Server-side DNS TXT check — the only way a domain becomes verified. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    requireWrite(ctx);
    const { id } = await params;
    const result = await checkDomainVerification(ctx.organizationId, id);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
