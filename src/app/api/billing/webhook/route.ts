import { NextRequest, NextResponse } from "next/server";
import { applyRecurringFlutterwaveCharge, verifyAndApplyPayment, webhookSecretValid } from "@/lib/services/billing";
import { ScanError } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Flutterwave webhook. Authenticated by the `verif-hash` secret, and the
 * transaction is ALWAYS re-verified against the Flutterwave API before
 * anything is granted — the webhook body alone is never trusted.
 * Recurring months arrive with a new tx_ref; those go through
 * applyRecurringFlutterwaveCharge so a charge always extends the plan.
 *
 * Failures are logged and return 500 so Flutterwave retries. Never silently
 * swallow errors and return 200 — that loses money.
 */
export async function POST(req: NextRequest) {
  if (!webhookSecretValid(req.headers.get("verif-hash"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { event?: string; data?: { tx_ref?: string; id?: number | string } } | null;
  const txRef = body?.data?.tx_ref;
  const flwTxId = body?.data?.id;
  if (!txRef && flwTxId === undefined) return NextResponse.json({ ok: true, ignored: true });
  try {
    const result = await verifyAndApplyPayment({ txRef, flwTxId: flwTxId !== undefined ? String(flwTxId) : undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Log the actual error for debugging; return 500 so Flutterwave retries.
    console.error("[billing/webhook] verifyAndApplyPayment failed:", err);
    if (err instanceof ScanError && err.code === "NOT_FOUND") {
      try {
        const result = await applyRecurringFlutterwaveCharge({ txRef, flwTxId: flwTxId !== undefined ? String(flwTxId) : undefined });
        return NextResponse.json({ ok: true, ...result });
      } catch (recurringErr) {
        console.error("[billing/webhook] applyRecurringFlutterwaveCharge failed:", recurringErr);
        return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "webhook processing failed" }, { status: 500 });
  }
}
