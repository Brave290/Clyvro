"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CONSENT_KEY = "clyvro-essential-cookie-choice-v1";

export default function CookieConsentBanner() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(CONSENT_KEY) !== "essential-only");
    } catch {
      setVisible(true);
    }
    setReady(true);
  }, []);

  function acceptEssentialOnly() {
    try {
      window.localStorage.setItem(CONSENT_KEY, "essential-only");
    } catch {
      // Keep the banner dismissible when storage is unavailable; no tracking is added.
    }
    setVisible(false);
  }

  if (!ready || !visible) return null;

  return (
    <aside
      aria-label="Cookie information"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_40px_rgba(2,6,23,0.18)] sm:bottom-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-5"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">Cookies &amp; privacy</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Clyvro uses an essential sign-in cookie. Optional analytics and advertising cookies are not active.
          <Link href="/privacy" className="ml-1 inline-flex min-h-6 items-center font-semibold text-accent underline-offset-2 hover:underline">Privacy policy</Link>
        </p>
      </div>
      <button
        type="button"
        onClick={acceptEssentialOnly}
        className="button-primary mt-3 w-full shrink-0 sm:mt-0 sm:w-auto"
        aria-label="Continue with essential cookies only"
      >
        Essential cookies only
      </button>
    </aside>
  );
}
