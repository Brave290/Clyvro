"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Pages always open at the top. Disables the browser's automatic scroll
 * restoration and scrolls to (0,0) on every route change — except when
 * the URL carries a #hash, where the anchor should win.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
