"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { currencyForRegion, type DisplayCurrency } from "@/lib/currencies";

/**
 * Pricing display currency — detected automatically from the visitor's
 * region (browser locale). There is deliberately no manual currency
 * picker/filter: Clyvro detects where you are and shows the matching
 * price; at checkout Flutterwave charges the fixed price for the detected
 * billing region (server-side, from the same plan table).
 */

type Rate = { currency: DisplayCurrency; value: number; date: string } | null;
type ContextValue = { currency: DisplayCurrency; rate: Rate; loading: boolean };
const CurrencyContext = createContext<ContextValue | null>(null);

function regionFromBrowser(): DisplayCurrency {
  const locale = navigator.languages?.[0] || navigator.language || "en-US";
  const match = locale.match(/-([A-Za-z]{2})(?:-|$)/);
  return currencyForRegion(match?.[1]);
}

export function PricingCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const [rate, setRate] = useState<Rate>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setCurrency(regionFromBrowser()); }, []);

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

  const context = useMemo(() => ({ currency, rate, loading }), [currency, rate, loading]);
  return <CurrencyContext.Provider value={context}>{children}</CurrencyContext.Provider>;
}

function usePricingCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error("Pricing currency must be inside PricingCurrencyProvider.");
  return value;
}

export function LocalizedPrice({ amountUsd }: { amountUsd: number }) {
  const { currency, rate } = usePricingCurrency();
  if (amountUsd === 0) return <>$0</>;
  if (currency === "USD" || !rate || rate.currency !== currency) return <>${amountUsd}</>;
  const local = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amountUsd * rate.value);
  return <>{local}<span className="sr-only">, approximately in your detected region currency, display only</span></>;
}
