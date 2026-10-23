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

  useEffect(() => {
    if (!ready || !visible) {
      document.body.style.removeProperty("padding-bottom");
      return;
    }
    document.body.style.paddingBottom = "4.5rem";
    return () => {
      document.body.style.removeProperty("padding-bottom");
    };
  }, [ready, visible]);

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
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-line bg-surface/95 px-3 py-2 shadow-[0_8px_24px_rgba(2,6,23,0.12)] backdrop-blur"
    >
      <p className="min-w-0 flex-1 text-xs leading-snug text-ink-soft">
        Essential sign-in cookie only.{" "}
        <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline">Privacy</Link>
      </p>
      <button
        type="button"
        onClick={acceptEssentialOnly}
        className="button-primary !min-h-11 shrink-0 !px-3 !py-1.5 text-xs"
        aria-label="Continue with essential cookies only"
      >
        OK
      </button>
    </aside>
  );
}
