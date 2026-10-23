"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

/**
 * Floating ^ on the right. Appears after the page has been scrolled,
 * sits above the cookie strip, and returns to the top of the document.
 */
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      }}
      className="fixed right-4 z-[70] grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink shadow-[0_8px_24px_rgba(2,6,23,0.12)] transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 print:hidden"
      style={{ bottom: "4.75rem" }}
    >
      <ChevronUp size={22} strokeWidth={2.25} aria-hidden />
    </button>
  );
}
