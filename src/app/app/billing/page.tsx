"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, LoaderCircle, ShieldAlert } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { useToast } from "@/components/Toast";

interface PlanInfo {
  id: string; name: string; tagline: string; features: string[];
  price: { amount: number; currency: string; formatted: string } | null;
}
interface PaymentRow { id: string; planId: string; amount: number; currency: string; status: string; createdAt: string; completedAt: string | null }
interface Payload {
  configured: boolean; currentPlanId: string; effectivePlanId: string;
  planExpiresAt: string | null; lapsed: boolean;
  payments: PaymentRow[]; plans: PlanInfo[]; currency: string; role: string;
}

export default function BillingPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't load billing.");
    setData(json as Payload);
  }, []);
  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load billing.")); }, [load]);

  async function checkout(planId: string) {
    setBusyPlan(planId);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.link) throw new Error(json?.error?.message ?? "Checkout couldn't start.");
      window.location.href = json.link as string;
    } catch (err) {
      toast("error", "Checkout couldn't start", err instanceof Error ? err.message : undefined);
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
          {data.lapsed && <> — that paid period has ended, so Freemium limits apply until you renew</>}.
          Prices below are shown in {data.currency} based on your region. Payments are processed by Flutterwave; a paid month starts the moment payment is verified.</>}
        </p>
      </header>
      {error && <p role="alert" className="form-error mt-4">{error}</p>}

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
                  {isCurrent ? "Renew / extend a month" : `Upgrade to ${plan.name}`}
                </button>
              ) : (
                <p className="mt-5 rounded-xl bg-canvas px-3 py-2.5 text-center text-xs font-semibold text-ink-soft">{isCurrent ? "Your current plan" : "Included by default"}</p>
              )}
              {isCurrent && paid && <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-accent">Current plan</p>}
            </article>
          );
        })}
      </div>

      {data && data.payments.length > 0 && (
        <section aria-label="Payment history" className="mt-10">
          <h2 className="text-lg font-bold">Payment history</h2>
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
