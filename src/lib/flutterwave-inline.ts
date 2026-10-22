"use client";

/**
 * Flutterwave Inline (in-app checkout).
 * Docs: https://developer.flutterwave.com/docs/inline
 *
 * The public key is returned by POST /api/billing/checkout after the
 * session + region checks — never baked into the client bundle. The
 * secret key never leaves the server. Encryption key is unused: we do
 * not collect card numbers ourselves.
 */

export const FLUTTERWAVE_INLINE_SCRIPT = "https://checkout.flutterwave.com/v3.js";

export interface FlutterwaveCheckoutPayload {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  customer: { email: string; name?: string; phone_number?: string };
  customizations?: { title?: string; description?: string; logo?: string };
  meta?: Record<string, string>;
  payment_options?: string;
  callback?: (payment: FlutterwaveCallbackPayment) => void;
  onclose?: (incomplete: boolean) => void;
}

export interface FlutterwaveCallbackPayment {
  amount: number;
  currency: string;
  status: string;
  tx_ref: string;
  transaction_id?: number;
  flw_ref?: string;
}

export interface FlutterwaveCheckoutModal {
  close: () => void;
}

declare global {
  interface Window {
    FlutterwaveCheckout?: (opts: FlutterwaveCheckoutPayload) => FlutterwaveCheckoutModal;
  }
}

export function loadFlutterwaveInline(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Flutterwave checkout only runs in the browser."));
  }
  if (typeof window.FlutterwaveCheckout === "function") return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${FLUTTERWAVE_INLINE_SCRIPT}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (typeof window.FlutterwaveCheckout === "function") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Couldn't load Flutterwave checkout.")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = FLUTTERWAVE_INLINE_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Flutterwave checkout. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

export function openFlutterwaveCheckout(opts: FlutterwaveCheckoutPayload): FlutterwaveCheckoutModal {
  const start = window.FlutterwaveCheckout;
  if (typeof start !== "function") {
    throw new Error("Flutterwave checkout isn't ready yet. Please try again.");
  }
  return start(opts);
}
