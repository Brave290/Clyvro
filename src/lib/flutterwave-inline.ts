"use client";

/**
 * Flutterwave pay window.
 *
 * Charges are created server-side (POST /v3/payments). The billing page
 * opens the returned hosted checkout URL in a popup so the customer stays
 * on Billing. Inline FlutterwaveCheckout() was returning "Invalid charge
 * request. Please contact support" for this account (currency / key
 * mismatch) — Standard returns the real error instead.
 */

export function openFlutterwavePayWindow(url: string): Window | null {
  const width = 480;
  const height = 740;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  return window.open(
    url,
    "clyvro-flutterwave",
    `popup=yes,width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );
}
