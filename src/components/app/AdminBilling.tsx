"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useAdminActions, SectionShell } from "@/components/app/AdminConsole";
import { ConfirmDialog } from "@/components/Dialog";
import { BILLING_CURRENCIES, PLAN_PRICES } from "@/lib/billing";
import { PLANS, type PlanId } from "@/lib/plans";
import type { CatalogPayload, PlanOverride } from "@/lib/services/plan-catalog";

const ORDER: PlanId[] = ["freemium", "basic", "pro", "ultra-agency"];

function defaultPricesFor(id: PlanId): PlanOverride["prices"] {
  return { ...(PLAN_PRICES[id] ?? {}) };
}

function restoreDraftPrices(prev: CatalogPayload): CatalogPayload {
  const next: CatalogPayload = { ...prev };
  for (const plan of PLANS) {
    next[plan.id] = {
      ...next[plan.id],
      monthlyPriceUsd: plan.monthlyPriceUsd,
      prices: plan.id === "freemium" ? {} : defaultPricesFor(plan.id),
    };
  }
  return next;
}

export function AdminBilling({ catalog }: { catalog: CatalogPayload }) {
  const { busy, act } = useAdminActions();
  const [draft, setDraft] = useState<CatalogPayload>(catalog);
  const [confirmRestore, setConfirmRestore] = useState(false);

  function patch(id: PlanId, next: Partial<PlanOverride>) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }
  function changePrice(id: PlanId, currency: (typeof BILLING_CURRENCIES)[number], raw: string) {
    const current = draft[id]?.prices ?? {};
    const previous = current[currency];
    const nextValue = raw === "" ? undefined : Number(raw);
    const prices = { ...current };
    if (nextValue === undefined || !Number.isFinite(nextValue)) delete prices[currency];
    else if (previous && previous > 0) {
      const ratio = nextValue / previous;
      for (const c of BILLING_CURRENCIES) {
        const old = current[c];
        prices[c] = c === currency ? nextValue : old === undefined ? undefined : Math.max(0, Math.round(old * ratio));
      }
    } else prices[currency] = nextValue;
    patch(id, { prices, ...(currency === "USD" && nextValue !== undefined ? { monthlyPriceUsd: nextValue } : {}) });
  }

  return (
    <SectionShell
      title="Billing plans"
      note="These names, features, limits and prices are live. Checkout charges NGN in Nigeria and USD everywhere else. Editing either amount scales the other by the same ratio. Saving updates the Billing page and checkout amounts immediately."
    >
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {ORDER.map((id) => {
          const p = draft[id] ?? {};
          const base = PLANS.find((plan) => plan.id === id);
          return (
            <article key={id} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">{id}</p>
              <label className="form-label mt-3 block" htmlFor={`name-${id}`}>Name</label>
              <input id={`name-${id}`} className="form-control mt-1" value={p.name ?? ""} maxLength={40}
                onChange={(e) => patch(id, { name: e.target.value })} />
              <label className="form-label mt-3 block" htmlFor={`tag-${id}`}>Tagline</label>
              <input id={`tag-${id}`} className="form-control mt-1" value={p.tagline ?? ""} maxLength={160}
                onChange={(e) => patch(id, { tagline: e.target.value })} />
              <label className="form-label mt-3 block" htmlFor={`feat-${id}`}>Features (one per line)</label>
              <textarea id={`feat-${id}`} className="form-control mt-1 min-h-32" value={(p.features ?? []).join("\n")}
                onChange={(e) => patch(id, { features: e.target.value.split("\n") })} />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  ["monthlyPriceUsd", "USD list"],
                  ["scansPerMonth", "Scans / month"],
                  ["maxPagesPerScan", "Pages / scan"],
                  ["maxProjects", "Websites"],
                  ["teamSeats", "Seats"],
                  ["maxCronJobs", "Scheduled jobs (URL pings)"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="form-label block" htmlFor={`${key}-${id}`}>{label}</label>
                    <input id={`${key}-${id}`} type="number" min={0} className="form-control mt-1"
                      value={p[key] ?? 0}
                      onChange={(e) => patch(id, { [key]: Number(e.target.value) })} />
                  </div>
                ))}
              </div>
              {id !== "freemium" && (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="form-label">Checkout prices (whole units)</p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      onClick={() => patch(id, {
                        prices: defaultPricesFor(id),
                        monthlyPriceUsd: base?.monthlyPriceUsd ?? p.monthlyPriceUsd,
                      })}
                    >
                      Restore amounts
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BILLING_CURRENCIES.map((c) => (
                      <div key={c}>
                        <label className="form-label block" htmlFor={`price-${id}-${c}`}>{c}</label>
                        <input id={`price-${id}-${c}`} type="number" min={0} className="form-control mt-1"
                          value={p.prices?.[c] ?? ""}
                          onChange={(e) => changePrice(id, c, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="button-primary" disabled={busy !== null}
          onClick={() => void act({ action: "billing.saveCatalog", catalog: draft }, "catalog")}>
          Save plans
        </button>
        <button type="button" className="button-secondary" disabled={busy !== null}
          onClick={() => setConfirmRestore(true)}>
          <RotateCcw size={15} aria-hidden /> Restore default prices
        </button>
        <p className="text-xs text-ink-mute">Logged in the admin audit log. Paid plans need a USD price above zero.</p>
      </div>
      <ConfirmDialog
        open={confirmRestore}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => {
          setConfirmRestore(false);
          void (async () => {
            const result = await act({ action: "billing.restorePrices", confirm: true }, "restore-prices");
            if (result) setDraft((prev) => restoreDraftPrices(prev));
          })();
        }}
        title="Restore default prices?"
        message="Every checkout amount (and the USD list price) goes back to the original list. Names, taglines, features and limits stay as they are. This is live as soon as you confirm."
        confirmLabel="Restore default prices"
      />
    </SectionShell>
  );
}
