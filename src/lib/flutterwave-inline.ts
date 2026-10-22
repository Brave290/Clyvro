"use client";

/**
 * Flutterwave Inline — card-only, in-page.
 *
 * Hosted Standard links (`/v3/hosted/pay/flwlnk-…`) are returning HTTP 500
 * (blank white page) for this merchant. Inline loads `v3.js` and opens the
 * card form in a modal on our page; it never hits those session URLs.
 *
 * If the script fails to load, we fall back to HTML Checkout: a POST to
 * `https://checkout.flutterwave.com/v3/hosted/pay` with the public key
 * (official HTML Checkout docs) — still card-only, still not a flwlnk GET.
 */

export interface FlutterwaveInlineCheckout {
  publicKey: string;
  txRef: string;
  amount: number;
  currency: string;
  customer: { email: string; name?: string };
  customizations: { title: string; description: string };
  meta: { organizationId: string; planId: string; paymentId: string };
}

type FlutterwaveModal = { close: () => void };

declare global {
  interface Window {
    FlutterwaveCheckout?: (opts: Record<string, unknown>) => FlutterwaveModal;
  }
}

const SCRIPT_SRC = "https://checkout.flutterwave.com/v3.js";
const HTML_CHECKOUT = "https://checkout.flutterwave.com/v3/hosted/pay";

function loadFlutterwaveScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout only runs in the browser."));
  }
  if (window.FlutterwaveCheckout) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.FlutterwaveCheckout) { resolve(); return; }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Couldn't load Flutterwave checkout.")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Flutterwave checkout."));
    document.head.appendChild(script);
  });
}

/** Official HTML Checkout: POST the payment fields, never a flwlnk session URL. */
export function submitFlutterwaveHtmlCheckout(checkout: FlutterwaveInlineCheckout) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = HTML_CHECKOUT;
  form.acceptCharset = "UTF-8";
  const fields: Array<[string, string]> = [
    ["public_key", checkout.publicKey],
    ["tx_ref", checkout.txRef],
    ["amount", String(checkout.amount)],
    ["currency", checkout.currency],
    ["payment_options", "card"],
    ["redirect_url", `${window.location.origin}/app/billing/verify`],
    ["customer[email]", checkout.customer.email],
    ["customer[name]", checkout.customer.name ?? "Clyvro customer"],
    ["customizations[title]", checkout.customizations.title],
    ["customizations[description]", checkout.customizations.description],
    ["meta[organizationId]", checkout.meta.organizationId],
    ["meta[planId]", checkout.meta.planId],
    ["meta[paymentId]", checkout.meta.paymentId],
  ];
  for (const [name, value] of fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/**
 * Open Flutterwave's card form on this page. Resolves `"paid"` when the
 * modal reports a completed charge (still must be verified server-side),
 * `"closed"` if the customer cancels. Navigates away on HTML fallback.
 */
export async function openFlutterwaveCardCheckout(
  checkout: FlutterwaveInlineCheckout,
): Promise<"paid" | "closed"> {
  try {
    await loadFlutterwaveScript();
  } catch {
    submitFlutterwaveHtmlCheckout(checkout);
    return new Promise(() => undefined);
  }
  const startCheckout = window.FlutterwaveCheckout;
  if (typeof startCheckout !== "function") {
    submitFlutterwaveHtmlCheckout(checkout);
    return new Promise(() => undefined);
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: "paid" | "closed") => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = startCheckout({
      public_key: checkout.publicKey,
      tx_ref: checkout.txRef,
      amount: checkout.amount,
      currency: checkout.currency,
      payment_options: "card",
      customer: {
        email: checkout.customer.email,
        name: checkout.customer.name,
      },
      customizations: checkout.customizations,
      meta: checkout.meta,
      callback: () => {
        try { modal.close(); } catch { /* modal may already be closing */ }
        done("paid");
      },
      onclose: () => done("closed"),
    });
  });
}
