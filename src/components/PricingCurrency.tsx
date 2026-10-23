"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Currency } from "@/lib/billing";

/**
 * Pricing display currency — same region + PLAN_PRICES table as checkout.
 * Detected from IP (server) then device timezone/locale. No picker.
 */

type PlanPrice = { amount: number; currency: Currency; formatted: string };
type Region = {
  currency: Currency;
  country: string | null;
  source: string;
  plans: Record<string, PlanPrice>;
};
type ContextValue = { region: Region | null; loading: boolean };
const CurrencyContext = createContext<ContextValue | null>(null);

export function PricingCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = navigator.languages?.[0] || navigator.language || "";
    const params = new URLSearchParams();
    if (tz) params.set("tz", tz);
    if (locale) params.set("locale", locale);
    const controller = new AbortController();
    void fetch(`/api/billing/region?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Region unavailable");
        return response.json() as Promise<Region>;
      })
      .then((data) => { if (!controller.signal.aborted) setRegion(data); })
      .catch(() => { if (!controller.signal.aborted) setRegion(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const context = useMemo(() => ({ region, loading }), [region, loading]);
  return <CurrencyContext.Provider value={context}>{children}</CurrencyContext.Provider>;
}

function usePricingCurrency() {
  const value = useContext(CurrencyContext);
  if (!value) throw new Error("Pricing currency must be inside PricingCurrencyProvider.");
  return value;
}

export function LocalizedPrice({ planId, amountUsd }: { planId: string; amountUsd: number }) {
  const { region } = usePricingCurrency();
  if (amountUsd === 0) return <>$0</>;
  const priced = region?.plans[planId];
  if (priced) return <>{priced.formatted}</>;
  return <>${amountUsd}</>;
}
