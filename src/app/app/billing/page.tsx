"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, LoaderCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import LocalDateTime from "@/components/LocalDateTime";
import { useToast } from "@/components/Toast";
import { openFlutterwaveCardCheckout, type FlutterwaveInlineCheckout } from "@/lib/flutterwave-inline";
import { deviceRegionHints } from "@/lib/billing-location";

interface PlanInfo {
  id: string; name: string; tagline: string; features: string[];
  price: { amount: number; currency: string; formatted: string } | null;
}
interface PaymentRow { id: string; planId: string; amount: number; currency: string; status: string; createdAt: string; completedAt: string | null }
interface Payload {
  configured: boolean; currentPlanId: string; effectivePlanId: string;
  planSource?: string; adminPlanId?: string | null;
  planExpiresAt: string | null; daysRemaining: number; renewalWindowOpen: boolean; lapsed: boolean;
  autoRenew?: boolean;
  usage?: { used: number; limit: number; resetsAt: string };
  premium?: { key: string; label: string; allowed: boolean; used: number; limit: number | null; remaining: number | null; period: string }[];
  payments: PaymentRow[]; paymentHistory: { page: number; pageSize: number; total: number; pageCount: number }; plans: PlanInfo[]; currency: string; role: string;
}

export default function BillingPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [autoRenewNext, setAutoRenewNext] = useState(false);
  const [busyRenew, setBusyRenew] = useState(false);

  const load = useCallback(async () => {
    const hints = deviceRegionHints();
    const q = new URLSearchParams();
    if (hints.timezone) q.set("tz", hints.timezone);
    if (hints.locale) q.set("locale", hints.locale);
    const res = await fetch(`/api/billing?${q}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't load billing.");
    setData(json as Payload);
  }, []);
  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load billing.")); }, [load]);

  async function checkout(planId: string) {
    setBusyPlan(planId);
    try {
      const hints = deviceRegionHints();
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, timezone: hints.timezone, locale: hints.locale, autoRenew: Boolean(data?.autoRenew || autoRenewNext) }) });
      const json = await res.json().catch(() => null);
      const checkout = json?.checkout as FlutterwaveInlineCheckout | undefined;
      if (!res.ok || !checkout?.publicKey || !checkout?.txRef) {
        throw new Error(json?.error?.message ?? "Checkout couldn't start.");
      }
      const outcome = await openFlutterwaveCardCheckout(checkout);
      const event = outcome === "paid" ? "" : "&event=close";
      const verify = await fetch(`/api/billing/verify?tx_ref=${encodeURIComponent(checkout.txRef)}${event}`, { method: "POST" });
      const body = await verify.json().catch(() => null);
      if (verify.ok && body?.status === "successful") {
        toast("success", "Payment received", "Your receipt is on its way — the plan is active for 30 days.");
      } else if (outcome === "closed") {
        toast("info", "Checkout closed", "No charge was made. You can try again whenever you're ready.");
      } else {
        toast("success", "Payment submitted", "We're confirming it with Flutterwave — your plan activates as soon as it clears.");
      }
      await load();
    } catch (err) {
      toast("error", "Checkout couldn't start", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyPlan(null);
    }
  }

  if (!data && !error) {
    return (
      <div className="mt-8" aria-busy="true">
        <div className="animate-pulse space-y-4">
          <div className="h-9 w-40 rounded-xl bg-line/70" />
          <div className="h-5 w-96 rounded-lg bg-line/50" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-72 rounded-2xl bg-line/50" />)}</div>
        </div>
      </div>
    );
  }

  const currentName = data?.plans.find((p) => p.id === data.currentPlanId)?.name ?? data?.currentPlanId;
  const canManage = data?.role === "owner" || data?.role === "admin";

  return (
    <div className="mt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {data && <>You&apos;re on <strong className="text-ink">{currentName}</strong>
          {data.planExpiresAt && data.currentPlanId !== "freemium" && <> until <LocalDateTime value={data.planExpiresAt} /></>}
          {data.planSource === "life-grant" && <> — this plan has no expiry (life grant), so it never needs renewal</>}
          {data.planSource === "admin-override" && <> — an administrator plan override ({data.adminPlanId}) is currently applied on top of your purchased plan</>}
          {data.lapsed && <> — that paid period has ended, so the workspace is on Freemium until you renew</>}.
          Prices below are shown in {data.currency}, from your connection and device region — there is no country to pick. Pay on this page via Flutterwave by card. A paid 30-day period starts the moment payment is verified.</>}
        </p>
      </header>
      {error && <p role="alert" className="form-error mt-4">{error}</p>}

      {data?.usage && (
        <section aria-label="Monthly scan usage" className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Scans this month</h2>
            <p className="text-sm text-ink-soft"><strong className="text-ink">{data.usage.used}</strong> of {data.usage.limit} used · resets <LocalDateTime value={data.usage.resetsAt} format="date" /></p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={data.usage.limit} aria-valuenow={Math.min(data.usage.used, data.usage.limit)} aria-label="Monthly scans used">
            <div className={`h-full rounded-full ${data.usage.used >= data.usage.limit ? "bg-bad" : data.usage.used / data.usage.limit >= 0.8 ? "bg-warn" : "bg-accent"}`} style={{ width: `${Math.min(100, (data.usage.used / Math.max(1, data.usage.limit)) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-mute">Failed, timed-out, and cancelled scans never count. Read our <a href="/refund-policy" className="font-semibold text-accent hover:underline">refund policy</a>.</p>
        </section>
      )}

      {data?.premium && data.premium.length > 0 && (
        <section aria-label="Tool allowances" className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Premium tool allowances</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Every plan can test every tool — these are the run caps on yours. Only real runs count
            (a Flow Scan whose browser can&apos;t start is refunded automatically). Full Scan is the one
            bundle reserved for Pro &amp; Ultra — it runs every engine under a single allowance.
          </p>
          <ul className="mt-4 space-y-4">
            {data.premium.map((t) => (
              <li key={t.key}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-ink-soft">
                    {t.limit === null
                      ? <strong className="text-good">Unlimited</strong>
                      : t.limit === 0
                        ? <strong className="text-ink">Not included</strong>
                        : <><strong className="text-ink">{t.remaining}</strong> of {t.limit} left {t.period === "lifetime" ? "(lifetime)" : "this month"}</>}
                  </span>
                </div>
                {t.limit !== null && (
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" role="progressbar"
                    aria-valuemin={0} aria-valuemax={t.limit} aria-valuenow={Math.min(t.used, t.limit)} aria-label={`${t.label} used`}>
                    <div className={`h-full rounded-full ${t.remaining === 0 ? "bg-bad" : (t.remaining ?? 1) / Math.max(1, t.limit) <= 0.2 ? "bg-warn" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, (t.used / Math.max(1, t.limit)) * 100)}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && !data.configured && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-5">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p className="text-sm leading-relaxed">
            <strong>Payments aren&apos;t switched on yet.</strong> Checkout opens as soon as billing is live — no charges happen before then, and your current plan stays exactly as it is.
          </p>
        </div>
      )}
      {data && data.configured && !canManage && (
        <p className="mt-6 text-sm text-ink-soft">Only workspace owners and admins can change the plan.</p>
      )}

      {data && data.configured && canManage && data.currentPlanId !== "freemium" && data.autoRenew && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            <strong className="text-ink">Auto-renew is on.</strong> Flutterwave will charge the same card each month and we add 30 days when that payment verifies. Turn it off any time — this month stays paid.
          </p>
          <button type="button" className="button-secondary" disabled={busyRenew}
            onClick={() => {
              setBusyRenew(true);
              void (async () => {
                try {
                  const res = await fetch("/api/billing/auto-renew", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false }) });
                  const json = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't turn auto-renew off.");
                  toast("success", "Auto-renew off", "No further monthly charges. Renew from this page when you want another month.");
                  await load();
                } catch (err) {
                  toast("error", "Couldn't update auto-renew", err instanceof Error ? err.message : undefined);
                } finally {
                  setBusyRenew(false);
                }
              })();
            }}>
            {busyRenew ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Turn auto-renew off
          </button>
        </div>
      )}

      {data && data.configured && canManage && !data.autoRenew && (
        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed text-ink-soft">
          <input type="checkbox" className="mt-1" checked={autoRenewNext} onChange={(e) => setAutoRenewNext(e.target.checked)} />
          <span>
            <strong className="text-ink">Renew automatically each month.</strong> Tick this before you pay and Flutterwave will charge the same card every month. We only extend the plan after that charge is verified — never before.
          </span>
        </label>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data?.plans.map((plan) => {
          const isCurrent = plan.id === data.currentPlanId;
          const paid = plan.id !== "freemium";
          return (
            <article key={plan.id} className={`flex flex-col rounded-2xl border bg-surface p-5 ${isCurrent ? "border-accent ring-1 ring-accent/40" : "border-line"}`}>
              <h2 className="font-bold">{plan.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-mute">{plan.tagline}</p>
              <p className="mt-3 text-2xl font-extrabold tracking-tight">
                {paid ? (plan.price ? <>{plan.price.formatted}<span className="text-sm font-semibold text-ink-mute">/mo</span></> : "—") : "Free"}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-ink-soft">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5"><Check size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />{f}</li>
                ))}
              </ul>
              {paid ? (
                <button type="button" disabled={!data.configured || !canManage || busyPlan !== null}
                  onClick={() => void checkout(plan.id)}
                  className={`${isCurrent ? "button-secondary" : "button-primary"} mt-5 w-full`}>
                  {busyPlan === plan.id ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <CreditCard size={15} aria-hidden />}
                  {isCurrent
                    ? data.renewalWindowOpen ? "Renew / extend a month" : "Pay for next month"
                    : `Upgrade to ${plan.name}`}
                </button>
              ) : (
                <p className="mt-5 rounded-xl bg-canvas px-3 py-2.5 text-center text-xs font-semibold text-ink-soft">{isCurrent ? "Your current plan" : "Included by default"}</p>
              )}
              {isCurrent && paid && <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-accent">
                Current plan{data.daysRemaining > 0 ? ` · ${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"} left` : ""}
              </p>}
            </article>
          );
        })}
      </div>

      {data && data.payments.length > 0 && (
        <section aria-label="Payment history" className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Recent payments</h2>
              <p className="mt-1 text-sm text-ink-soft">The latest three payment attempts.</p>
            </div>
            {data.paymentHistory.total > 3 && <Link href="/app/billing/history" className="button-secondary !min-h-9 !px-3 !py-1.5 text-sm">View full history</Link>}
          </div>
          <ul className="mt-4 space-y-2">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
                <span className="flex-1 font-semibold capitalize">{p.planId.replace("-", " ")}</span>
                <span>{p.currency} {p.amount.toLocaleString()}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${p.status === "successful" ? "bg-good-soft text-good" : p.status === "pending" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>{p.status}</span>
                <span className="text-xs text-ink-mute"><LocalDateTime value={p.createdAt} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
