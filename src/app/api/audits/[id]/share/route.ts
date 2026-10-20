import { NextRequest, NextResponse } from "next/server";
import { createShareToken, listShareTokens, revokeShareToken } from "@/lib/services/audits";
import { apiError, readJsonBody, requireSession } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId } = await requireSession();
    const { id } = await params;
    return NextResponse.json({ shares: await listShareTokens(organizationId, id) });
  } catch (err) {
    return apiError(err);
  }
}

/** Creates a share link. The raw token is returned exactly once — only its hash is stored. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, organizationId } = await requireSession();
    const { id } = await params;
    const { token } = await createShareToken(organizationId, userId, id);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ url: `${origin}/shared/${token}` }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { organizationId } = await requireSession();
    const body = await readJsonBody(req);
    await revokeShareToken(organizationId, String(body.tokenId ?? ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
