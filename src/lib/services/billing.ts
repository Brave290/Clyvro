import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { memberships, organizations, payments, users } from "@/lib/db/schema";
import { currentPlans, effectivePlanForOrg, getPlan } from "@/lib/plans";
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
  const plan = currentPlans().find((p) => p.id === planId);
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
  const [payer] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, payment.userId)).limit(1);
  if (payer) {
    const planName = getPlan(payment.planId).name;
    const amountFormatted = formatMoney(payment.amount, payment.currency as Currency);
    const paidAt = new Date().toISOString();
    await enqueueUserNotification({
      organizationId: payment.organizationId, userId: payment.userId, category: "billing",
      kind: "payment_receipt", dedupeKey: `payment:${payment.id}`,
      toEmail: payer.email,
      subject: `Receipt — ${planName} plan, ${amountFormatted}`,
      body: JSON.stringify({
        planName, amountFormatted, currency: payment.currency, txRef: payment.txRef,
        paidAt, customerName: payer.name || payer.email,
      }),
    }, db).catch(() => undefined);
  }
  return { applied: true, status: "successful" };
}

/**
 * Live settle after the Flutterwave modal closes. Always re-asks Flutterwave:
 * if the charge went through we grant the plan; if they cancelled or the
 * charge never started, the pending row becomes `cancelled` (no grant).
 */
export async function settleCheckout(
  txRef: string,
  event: "paid" | "close",
  deps: { fetchImpl?: FetchLike } = {}, dbOverride?: DB,
): Promise<{ applied: boolean; status: string }> {
  const verified = await verifyAndApplyPayment({ txRef }, deps, dbOverride);
  if (verified.status === "successful") return verified;
  if (event !== "close") return verified;
  const db = dbOverride ?? (await getDb());
  await db.update(payments)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(payments.txRef, txRef), eq(payments.status, "pending")));
  const [row] = await db.select({ status: payments.status }).from(payments).where(eq(payments.txRef, txRef)).limit(1);
  return { applied: false, status: row?.status ?? "cancelled" };
}

const ABANDON_AFTER_MS = 30 * 60 * 1000;
const ABANDON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One follow-up email for checkouts that were started then left (pending
 * or cancelled, 30 minutes–7 days old). Deduped per payment so dispatcher
 * retries never nag twice. Skips anyone who already paid successfully.
 */
export async function nudgeAbandonedPayments(
  deps: { now?: Date } = {}, dbOverride?: DB,
): Promise<{ nudged: number }> {
  const db = dbOverride ?? (await getDb());
  const now = deps.now ?? new Date();
  const olderThan = new Date(now.getTime() - ABANDON_AFTER_MS);
  const newerThan = new Date(now.getTime() - ABANDON_WINDOW_MS);
  const rows = await db.select().from(payments)
    .where(and(
      inArray(payments.status, ["pending", "cancelled"]),
    ))
    .orderBy(desc(payments.createdAt))
    .limit(50);
  let nudged = 0;
  for (const row of rows) {
    if (row.createdAt > olderThan || row.createdAt < newerThan) continue;
    const [later] = await db.select({ id: payments.id }).from(payments)
      .where(and(
        eq(payments.organizationId, row.organizationId),
        eq(payments.status, "successful"),
      ))
      .limit(1);
    if (later) continue;
    const [payer] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
    if (!payer) continue;
    const planName = getPlan(row.planId).name;
    const amountFormatted = formatMoney(row.amount, row.currency as Currency);
    const created = await enqueueUserNotification({
      organizationId: row.organizationId, userId: row.userId, category: "billing",
      kind: "payment_abandoned", dedupeKey: `payment-abandon:${row.id}`,
      toEmail: payer.email,
      subject: `You left a ${planName} checkout — your card was not charged`,
      body: JSON.stringify({ planName, amountFormatted, currency: row.currency }),
    }, db);
    if (created) nudged++;
  }
  return { nudged };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Remind owners/admins that a paid plan is about to end (7 days and
 * 1 day out) and when it has already lapsed. Deduped per org + expiry
 * date + window so the dispatcher can retry without nagging. Life
 * grants (no expiry) and admin overrides are skipped. Run this BEFORE
 * reconcileExpiredPlans so we still know which plan they were on.
 */
export async function notifyPlanExpiry(
  deps: { now?: Date } = {}, dbOverride?: DB,
): Promise<{ reminded: number }> {
  const db = dbOverride ?? (await getDb());
  const now = deps.now ?? new Date();
  const rows = await db.select().from(organizations)
    .where(and(
      ne(organizations.planId, "freemium"),
      isNotNull(organizations.planExpiresAt),
      isNull(organizations.adminPlanId),
    ))
    .limit(200);
  let reminded = 0;
  for (const org of rows) {
    const expiry = org.planExpiresAt;
    if (!expiry) continue;
    const ms = expiry.getTime() - now.getTime();
    const window = ms <= 0 ? "expired" : ms <= 36 * 60 * 60 * 1000 ? "1d" : ms <= 7.5 * DAY_MS ? "7d" : null;
    if (!window) continue;
    const planName = getPlan(org.planId).name;
    const expiresAt = expiry.toISOString();
    const members = await db.select({ email: users.email, userId: users.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(
        eq(memberships.organizationId, org.id),
        inArray(memberships.role, ["owner", "admin"]),
      ));
    for (const member of members) {
      const created = await enqueueUserNotification({
        organizationId: org.id, userId: member.userId, category: "billing",
        kind: window === "expired" ? "plan_expired" : "plan_expiring",
        dedupeKey: `plan-expiry:${window}:${org.id}:${expiresAt.slice(0, 10)}:${member.userId}`,
        toEmail: member.email,
        subject: window === "expired"
          ? `Your ${planName} plan has ended — the workspace is on Free`
          : window === "1d"
            ? `Your ${planName} plan ends tomorrow`
            : `Your ${planName} plan ends in 7 days`,
        body: JSON.stringify({ planName, expiresAt, window }),
      }, db);
      if (created) reminded++;
    }
  }
  return { reminded };
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
