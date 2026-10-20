import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { organizations, payments, users } from "@/lib/db/schema";
import { PLANS, effectivePlan } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";
import {
  billingConfigured, detectCurrency, flutterwaveApiBase, priceFor, type Currency,
} from "@/lib/billing";

/**
 * Flutterwave billing (server-side only).
 *
 * Flow: createCheckout → pending payment row (amount from the fixed
 * price table, never the client) → Flutterwave hosted checkout link →
 * webhook (verif-hash) and/or /app/billing/verify re-verify the
 * transaction against the Flutterwave API → amount+currency must match
 * the pending row → grant the plan for 30 days from max(now, current
 * expiry). Verification is idempotent: an already-successful payment
 * never grants twice.
 */

const GRANT_MS = 30 * 24 * 60 * 60 * 1000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "");
}

export async function createCheckout(
  organizationId: string, userId: string, planId: string,
  headers: Headers, deps: { fetchImpl?: FetchLike } = {}, dbOverride?: DB,
): Promise<{ paymentId: string; link: string; amount: number; currency: Currency }> {
  if (!billingConfigured()) {
    throw new ScanError("NOT_IMPLEMENTED", "Payments aren't switched on yet — checkout opens as soon as billing keys are live. Your current plan stays exactly as it is.");
  }
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan || plan.id === "freemium") throw new ScanError("INVALID_INPUT", "Choose a paid plan to check out.");
  const price = priceFor(plan.id, detectCurrency(headers));
  if (!price) throw new ScanError("INVALID_INPUT", "No price is configured for that plan.");

  const db = dbOverride ?? (await getDb());
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ScanError("UNAUTHORIZED", "Sign in again to continue.");

  const txRef = `clyvro_${randomUUID()}`;
  const paymentId = newId();
  await db.insert(payments).values({
    id: paymentId, organizationId, userId, planId: plan.id,
    amount: price.amount, currency: price.currency, txRef, status: "pending",
  });

  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(`${flutterwaveApiBase()}/payments`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      tx_ref: txRef,
      amount: price.amount,
      currency: price.currency,
      redirect_url: `${siteUrl()}/app/billing/verify`,
      customer: { email: user.email, name: user.name ?? undefined },
      customizations: {
        title: "Clyvro",
        description: `${plan.name} plan — monthly`,
      },
      meta: { organizationId, planId: plan.id },
    }),
  });
  const data = (await res.json().catch(() => null)) as { status?: string; data?: { link?: string } } | null;
  if (!res.ok || data?.status !== "success" || !data.data?.link) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, paymentId));
    throw new ScanError("FETCH_FAILED", "The payment page couldn't be created. Please try again in a moment.");
  }
  return { paymentId, link: data.data.link, amount: price.amount, currency: price.currency };
}

interface FlwTx {
  id: number | string; tx_ref: string; status: string; amount: number; currency: string;
}

/** Verify one transaction with Flutterwave and apply it idempotently. */
export async function verifyAndApplyPayment(
  txRefOrId: { txRef?: string; flwTxId?: string },
  deps: { fetchImpl?: FetchLike } = {}, dbOverride?: DB,
): Promise<{ applied: boolean; status: string }> {
  const db = dbOverride ?? (await getDb());
  const [payment] = txRefOrId.txRef
    ? await db.select().from(payments).where(eq(payments.txRef, txRefOrId.txRef)).limit(1)
    : await db.select().from(payments).where(eq(payments.flwTxId, txRefOrId.flwTxId!)).limit(1);
  if (!payment) throw new ScanError("NOT_FOUND", "Payment not found.");
  if (payment.status === "successful") return { applied: false, status: "successful" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const byRef = `${flutterwaveApiBase()}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(payment.txRef)}`;
  const res = await fetchImpl(byRef, { headers: { authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` } });
  const data = (await res.json().catch(() => null)) as { status?: string; data?: FlwTx } | null;
  const tx = data?.data;
  if (!res.ok || data?.status !== "success" || !tx) {
    return { applied: false, status: payment.status };
  }

  const matches = tx.tx_ref === payment.txRef && Number(tx.amount) >= payment.amount && tx.currency === payment.currency;
  if (tx.status !== "successful" || !matches) {
    if (tx.status === "failed" || (tx.status === "successful" && !matches)) {
      await db.update(payments).set({ status: "failed", flwTxId: String(tx.id) }).where(eq(payments.id, payment.id));
    }
    return { applied: false, status: tx.status };
  }

  // Claim the success transition atomically (pending → successful) so a
  // webhook + verify racing can't both grant.
  const claimed = await db.update(payments)
    .set({ status: "successful", flwTxId: String(tx.id), completedAt: new Date() })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")))
    .returning();
  if (claimed.length === 0) return { applied: false, status: "successful" };

  const [org] = await db.select().from(organizations).where(eq(organizations.id, payment.organizationId)).limit(1);
  if (org) {
    const base = org.planExpiresAt && org.planExpiresAt.getTime() > Date.now() && org.planId === payment.planId
      ? org.planExpiresAt.getTime() : Date.now();
    await db.update(organizations)
      .set({ planId: payment.planId, planExpiresAt: new Date(base + GRANT_MS) })
      .where(eq(organizations.id, org.id));
  }
  return { applied: true, status: "successful" };
}

/** Timing-safe webhook secret comparison (Flutterwave `verif-hash`). */
export function webhookSecretValid(provided: string | null): boolean {
  const expected = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  // Constant-time-ish compare without leaking length shortcuts.
  let diff = expected.length ^ provided.length;
  const len = Math.max(expected.length, provided.length);
  for (let i = 0; i < len; i++) diff |= (expected.charCodeAt(i % Math.max(expected.length, 1)) || 0) ^ (provided.charCodeAt(i % Math.max(provided.length, 1)) || 0);
  return diff === 0;
}

export async function billingSummary(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  const history = await db.select().from(payments)
    .where(eq(payments.organizationId, organizationId))
    .orderBy(desc(payments.createdAt))
    .limit(20);
  const effective = effectivePlan(org.planId, org.planExpiresAt);
  return {
    configured: billingConfigured(),
    currentPlanId: org.planId,
    effectivePlanId: effective.id,
    planExpiresAt: org.planExpiresAt?.toISOString() ?? null,
    lapsed: org.planId !== "freemium" && effective.id === "freemium",
    payments: history.map((p) => ({
      id: p.id, planId: p.planId, amount: p.amount, currency: p.currency,
      status: p.status, createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
    })),
  };
}
