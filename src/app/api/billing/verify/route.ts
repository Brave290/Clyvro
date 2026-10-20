import { NextRequest, NextResponse } from "next/server";
import { verifyAndApplyPayment } from "@/lib/services/billing";
import { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { apiError, requireSession } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Post-checkout landing verification (session + ownership checked). */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const txRef = req.nextUrl.searchParams.get("tx_ref") ?? "";
    if (!txRef) return NextResponse.json({ error: { message: "Missing payment reference." } }, { status: 400 });
    const db = await getDb();
    const [payment] = await db.select({ organizationId: payments.organizationId })
      .from(payments).where(eq(payments.txRef, txRef)).limit(1);
    if (!payment || payment.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: { message: "Payment not found." } }, { status: 404 });
    }
    const result = await verifyAndApplyPayment({ txRef });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
