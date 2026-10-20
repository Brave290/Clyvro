import { NextRequest, NextResponse } from "next/server";
import { verifyAndApplyPayment, webhookSecretValid } from "@/lib/services/billing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Flutterwave webhook. Authenticated by the `verif-hash` secret, and the
 * transaction is ALWAYS re-verified against the Flutterwave API before
 * anything is granted — the webhook body alone is never trusted.
 */
export async function POST(req: NextRequest) {
  if (!webhookSecretValid(req.headers.get("verif-hash"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { event?: string; data?: { tx_ref?: string; id?: number | string } } | null;
  const txRef = body?.data?.tx_ref;
  if (!txRef) return NextResponse.json({ ok: true, ignored: true });
  try {
    const result = await verifyAndApplyPayment({ txRef });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    // Unknown tx_ref etc. — acknowledge so Flutterwave doesn't retry forever.
    return NextResponse.json({ ok: true, ignored: true });
  }
}
