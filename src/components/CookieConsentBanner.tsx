"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
    document.body.style.paddingBottom = "3rem";
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

  return createPortal(
    <aside
      aria-label="Cookie information"
      // Inline position so a parent filter/backdrop-blur cannot pin this to the header.
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, top: "auto", zIndex: 80 }}
      className="border-t border-line bg-surface px-3 py-1.5 shadow-[0_-6px_18px_rgba(2,6,23,0.08)]"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-tight text-ink-soft">
          Essential sign-in cookie only.{" "}
          <Link href="/privacy" className="font-semibold text-accent underline-offset-2 hover:underline">Privacy</Link>
        </p>
        <button
          type="button"
          onClick={acceptEssentialOnly}
          className="button-primary !min-h-8 shrink-0 !rounded-md !px-2.5 !py-1 text-[11px]"
          aria-label="Continue with essential cookies only"
        >
          OK
        </button>
      </div>
    </aside>,
    document.body,
  );
}
