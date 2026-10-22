"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import LocalDateTime from "@/components/LocalDateTime";
import { deviceRegionHints } from "@/lib/billing-location";

interface PaymentRow {
  id: string;
  planId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface Payload {
  payments: PaymentRow[];
  paymentHistory: { page: number; pageSize: number; total: number; pageCount: number };
  currency: string;
}

function statusClass(status: string) {
  if (status === "successful") return "bg-good-soft text-good";
  if (status === "pending") return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}

export default function PaymentHistoryPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const hints = deviceRegionHints();
    const q = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (hints.timezone) q.set("tz", hints.timezone);
    if (hints.locale) q.set("locale", hints.locale);
    const response = await fetch(`/api/billing?${q}`);
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.error?.message ?? "Couldn’t load payment history.");
    setData(json as Payload);
  }, [page]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Couldn’t load payment history."));
  }, [load]);

  return (
    <div className="mt-8 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/billing" className="text-sm font-semibold text-accent hover:underline">← Back to billing</Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Payment history</h1>
          <p className="mt-2 text-sm text-ink-soft">Every checkout attempt for this workspace, newest first.</p>
        </div>
        <Receipt className="mt-1 text-accent" size={24} aria-hidden />
      </div>

      {error && <p role="alert" className="form-error mt-6">{error}</p>}
      {!data && !error && <p className="mt-8 text-sm text-ink-mute" role="status">Loading payment history…</p>}
      {data && (
        <>
          {data.payments.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft">No payment attempts yet.</p>
          ) : (
            <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
              <ul className="divide-y divide-line">
                {data.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                    <span className="min-w-36 flex-1 font-semibold capitalize">{payment.planId.replace("-", " ")}</span>
                    <span className="text-sm font-medium">{payment.currency} {payment.amount.toLocaleString()}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusClass(payment.status)}`}>{payment.status}</span>
                    <span className="w-full text-xs text-ink-mute sm:w-auto"><LocalDateTime value={payment.createdAt} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.paymentHistory.pageCount > 1 && (
            <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Payment history pages">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="button-secondary !min-h-9 !px-3 text-sm">
                <ChevronLeft size={15} aria-hidden /> Previous
              </button>
              <span className="text-sm text-ink-soft">Page {data.paymentHistory.page} of {data.paymentHistory.pageCount}</span>
              <button type="button" disabled={page >= data.paymentHistory.pageCount} onClick={() => setPage((current) => current + 1)} className="button-secondary !min-h-9 !px-3 text-sm">
                Next <ChevronRight size={15} aria-hidden />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
