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
      className="border-b border-line bg-surface px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-5"
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">Cookies &amp; privacy</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Clyvro uses an essential sign-in cookie. Optional analytics and advertising cookies are not active.
          <Link href="/privacy" className="ml-1 inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline">Privacy policy</Link>
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
