import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { organizations, payments, users } from "@/lib/db/schema";
import { PLANS, effectivePlanForOrg } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";
import {
  billingConfigured, currencyForCountry, flutterwaveApiBase, flutterwavePublicKey, flutterwaveSecretKey,
  formatMoney, priceFor, type Currency,
} from "@/lib/billing";
import { enqueueUserNotification } from "./notifications";
import { verifyPaymentRegion } from "./payment-region";

/**
 * Flutterwave billing (server-side only).
 *
 * Flow: createCheckout → pending payment row (amount from the fixed
 * price table, never the client) → return Inline payload (public key,
 * tx_ref, amount, currency). The browser opens Flutterwave Inline with
 * payment_options: "card" so every country lands on the card form.
 * Hosted Standard `flwlnk-…` pages were returning HTTP 500 (blank
 * white). Webhook (verif-hash) and/or /api/billing/verify re-verify
 * against the Flutterwave API → amount+currency must match the pending
 * row → grant the plan for 30 days. Verification is idempotent.
 */

export interface InlineCheckout {
  publicKey: string;
  txRef: string;
  amount: number;
  currency: Currency;
  customer: { email: string; name?: string };
  customizations: { title: string; description: string };
  meta: { organizationId: string; planId: string; paymentId: string };
}

const GRANT_MS = 30 * 24 * 60 * 60 * 1000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function createCheckout(
  organizationId: string, userId: string, planId: string,
  headers: Headers, deps: { fetchImpl?: FetchLike; timezone?: string; locale?: string } = {}, dbOverride?: DB,
): Promise<{ paymentId: string; amount: number; currency: Currency; checkout: InlineCheckout }> {
  if (!billingConfigured()) {
    throw new ScanError("NOT_IMPLEMENTED", "Payments aren't switched on yet — checkout opens as soon as billing keys are live. Your current plan stays exactly as it is.");
  }
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan || plan.id === "freemium") throw new ScanError("INVALID_INPUT", "Choose a paid plan to check out.");

  // Region: VPN/proxy discarded; country from IP + device timezone/locale
  // — the customer never picks a country. Currency follows that country
  // so Flutterwave charges Naira in Nigeria, pounds in the UK, etc.
  const region = await verifyPaymentRegion(
    headers,
    { timezone: deps.timezone, locale: deps.locale },
    { fetchImpl: deps.fetchImpl },
  );
  if (region.decision === "block") {
    throw new ScanError("FORBIDDEN", region.reason ?? "Checkout isn't available from this connection.");
  }
  const price = priceFor(plan.id, currencyForCountry(region.country));
  if (!price) throw new ScanError("INVALID_INPUT", "No price is configured for that plan.");

  const db = dbOverride ?? (await getDb());
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ScanError("UNAUTHORIZED", "Sign in again to continue.");

  const publicKey = flutterwavePublicKey();
  const txRef = `clyvro_${randomUUID().replace(/-/g, "")}`;
  const paymentId = newId();
  await db.insert(payments).values({
    id: paymentId, organizationId, userId, planId: plan.id,
    amount: price.amount, currency: price.currency, txRef, status: "pending",
  });

  const customer = { email: user.email, name: (user.name ?? "").trim() || "Clyvro customer" };
  const customizations = { title: "Clyvro", description: `${plan.name} plan, one month` };
  const checkout: InlineCheckout = {
    publicKey,
    txRef,
    amount: price.amount,
    currency: price.currency,
    customer,
    customizations,
    meta: { organizationId, planId: plan.id, paymentId },
  };
  return { paymentId, amount: price.amount, currency: price.currency, checkout };
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
  const res = await fetchImpl(byRef, { headers: { authorization: `Bearer ${flutterwaveSecretKey()}` } });
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
  // Payment-received email (deduped per payment — webhook replays and
  // verify-page refreshes can never send it twice).
  const [payer] = await db.select({ email: users.email }).from(users).where(eq(users.id, payment.userId)).limit(1);
  if (payer) {
    await enqueueUserNotification({
      organizationId: payment.organizationId, userId: payment.userId, category: "billing",
      kind: "payment_received", dedupeKey: `payment:${payment.id}`,
      toEmail: payer.email,
      subject: "Payment received — your Clyvro plan is active",
      body: `We verified your payment of ${formatMoney(payment.amount, payment.currency as Currency)} for the ${payment.planId} plan. It runs for 30 days; when it ends the workspace returns to Freemium unless you renew. Reference: ${payment.txRef}.`,
    }, db).catch(() => undefined);
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
  const effective = effectivePlanForOrg(org);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { monthlyScanUsage } = await import("./audits");
  const used = await monthlyScanUsage(organizationId, db);
  return {
    configured: billingConfigured(),
    currentPlanId: org.planId,
    effectivePlanId: effective.id,
    // Where the effective plan comes from — purchased, admin override, or
    // a no-expiry life grant. Shown plainly on the billing page.
    planSource: org.adminPlanId ? "admin-override" : org.planId !== "freemium" && !org.planExpiresAt ? "life-grant" : "purchased",
    adminPlanId: org.adminPlanId,
    planExpiresAt: org.planExpiresAt?.toISOString() ?? null,
    usage: { used, limit: effective.scansPerMonth, resetsAt: resetsAt.toISOString(), monthStart: monthStart.toISOString() },
    lapsed: org.planId !== "freemium" && effective.id === "freemium" && !org.adminPlanId,
    payments: history.map((p) => ({
      id: p.id, planId: p.planId, amount: p.amount, currency: p.currency,
      status: p.status, createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
    })),
  };
}
