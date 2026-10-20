"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";

function VerifyInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"checking" | "ok" | "fail">("checking");
  const [message, setMessage] = useState("Verifying your payment with Flutterwave…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const txRef = params.get("tx_ref");
    const status = params.get("status");
    if (!txRef) {
      setState("fail");
      setMessage("No payment reference came back. If you were charged, the plan still activates automatically via our payment webhook — check Billing in a minute.");
      return;
    }
    if (status === "cancelled") {
      setState("fail");
      setMessage("Checkout was cancelled — no charge was made.");
      return;
    }
    void (async () => {
      const res = await fetch(`/api/billing/verify?tx_ref=${encodeURIComponent(txRef)}`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.status === "successful") {
        setState("ok");
        setMessage("Payment verified — your plan is active for the next 30 days.");
      } else {
        setState("fail");
        setMessage("We couldn't confirm this payment yet. If money left your account, the plan activates automatically once Flutterwave confirms — check Billing shortly.");
      }
    })();
  }, [params]);

  return (
    <div className="mt-16 mx-auto max-w-lg rounded-3xl border border-line bg-surface p-8 text-center">
      {state === "checking" && <LoaderCircle size={36} className="mx-auto animate-spin text-accent" aria-hidden />}
      {state === "ok" && <CheckCircle2 size={36} className="mx-auto text-good" aria-hidden />}
      {state === "fail" && <XCircle size={36} className="mx-auto text-bad" aria-hidden />}
      <h1 className="mt-4 text-xl font-bold">{state === "ok" ? "You're all set" : state === "checking" ? "Confirming payment" : "Not confirmed"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft" role="status">{message}</p>
      <Link href="/app/billing" className="button-primary mt-6 inline-flex">Back to billing</Link>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 h-56 max-w-lg animate-pulse rounded-3xl bg-line/50" aria-busy="true" />}>
      <VerifyInner />
    </Suspense>
  );
}
