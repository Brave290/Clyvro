"use client";

/**
 * Flutterwave Standard is a full-page checkout. Their hosted pay links
 * (`checkout.flutterwave.com/v3/hosted/pay/flwlnk-…`) render blank in a
 * popup — the docs say to redirect the customer to the link. Card-only
 * is set on the server (`payment_options: "card"`).
 */
export function goToFlutterwaveCheckout(url: string) {
  window.location.assign(url);
}
