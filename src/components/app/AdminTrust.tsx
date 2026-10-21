"use client";

import { useEffect } from "react";

const KEY = "clyvro.adminTrust.v1";

/**
 * Mounted in the admin layout: once per browser session it asks the
 * server to mark this browser as trusted by Shield (30-day HMAC cookie),
 * so the founder keeps full access when their IP changes. Silent and
 * idempotent; failures are ignored (the page already rendered).
 */
export default function AdminTrust() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(KEY) === "1") return;
    } catch { /* storage unavailable — fall through and ask anyway */ }
    fetch("/api/admin/trust", { method: "POST", credentials: "same-origin" })
      .then((r) => {
        if (r.ok) {
          try { window.sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
        }
      })
      .catch(() => undefined);
  }, []);
  return null;
}
