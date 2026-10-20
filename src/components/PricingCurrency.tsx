"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BrandSelect, type BrandSelectOption } from "@/components/ui";
import { currencyForRegion, DISPLAY_CURRENCIES, isDisplayCurrency, type DisplayCurrency } from "@/lib/currencies";

type Rate = { currency: DisplayCurrency; value: number; date: string } | null;
type ContextValue = { currency: DisplayCurrency; rate: Rate; loading: boolean; setCurrency: (value: DisplayCurrency) => void; resetRegion: () => void };
const CurrencyContext = createContext<ContextValue | null>(null);
const STORAGE_KEY = "clyvro:display-currency";

function regionFromBrowser() {
  const locale = navigator.languages?.[0] || navigator.language || "en-US";
  const match = locale.match(/-([A-Za-z]{2})(?:-|$)/);
  return currencyForRegion(match?.[1]);
}

export function PricingCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>("USD");
  const [rate, setRate] = useState<Rate>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setCurrencyState(saved && isDisplayCurrency(saved) ? saved : regionFromBrowser());
  }, []);

  useEffect(() => {
    if (currency === "USD") {
      setRate({ currency: "USD", value: 1, date: new Date().toISOString().slice(0, 10) });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/exchange-rate?currency=${encodeURIComponent(currency)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Exchange rate unavailable");
        return response.json() as Promise<{ quote: DisplayCurrency; rate: number; date: string }>;
      })
      .then((data) => setRate({ currency: data.quote, value: data.rate, date: data.date }))
      .catch(() => { if (!controller.signal.aborted) setRate(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currency]);

  const setCurrency = (value: DisplayCurrency) => {
    localStorage.setItem(STORAGE_KEY, value);
    setCurrencyState(value);
  };
  const resetRegion = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrencyState(regionFromBrowser());
  };
  const context = useMemo(() => ({ currency, rate, loading, setCurrency, resetRegion }), [currency, rate, loading]);

  return <CurrencyContext.Provider value={context}>{children}</CurrencyContext.Provider>;
}

function usePricingCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error("Pricing currency controls must be inside PricingCurrencyProvider.");
  return value;
}

const currencyOptions: BrandSelectOption[] = DISPLAY_CURRENCIES.map(([code, name]) => ({ value: code, label: `${code} — ${name}` }));

export function PricingCurrencyControl() {
  const { currency, rate, loading, setCurrency, resetRegion } = usePricingCurrency();
  const rateDate = rate && rate.currency !== "USD" ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${rate.date}T00:00:00Z`)) : null;
  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="pricing-display-currency" className="mb-1.5 block text-sm font-semibold">Display prices in</label>
          <BrandSelect id="pricing-display-currency" value={currency} onChange={(value) => { if (isDisplayCurrency(value)) setCurrency(value); }} options={currencyOptions} className="w-full" />
        </div>
        <button type="button" onClick={resetRegion} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink-soft transition hover:border-accent/50 hover:text-accent">Use my region</button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-mute">
        {loading ? "Loading a daily reference rate… " : ""}
        {currency === "USD" ? "USD is the canonical proposed price." : rate ? `Approximate display only, using the ${rateDate} daily reference rate; USD remains the proposed price.` : "The local reference rate is unavailable; prices remain in USD."}
        {" "}Paid plans are not available for purchase, and this is not a billing quote. Rates by <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">Frankfurter</a>.
      </p>
    </div>
  );
}

export function LocalizedPrice({ amountUsd }: { amountUsd: number }) {
  const { currency, rate } = usePricingCurrency();
  if (amountUsd === 0) return <>$0</>;
  if (currency === "USD" || !rate || rate.currency !== currency) return <>${amountUsd}</>;
  const local = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amountUsd * rate.value);
  return <>{local}<span className="sr-only">, approximately, display only</span></>;
}
