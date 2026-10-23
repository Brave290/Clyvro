"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Live data without websockets: quietly re-renders the server-rendered
 * page (usage counters, billing state, lists, sidebar allowances) on a
 * gentle interval, when the tab becomes visible again, and when the
 * window regains focus. Pauses entirely while the tab is hidden, and
 * never interrupts client state (forms and local UI state are preserved
 * by router.refresh). Server-side gates remain authoritative — this
 * only keeps what the user SEES as fresh as what the API enforces.
 */
export default function LiveRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      // Avoid a burst right after mount/navigation.
      if (Date.now() - last < 2_000) return;
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(maybeRefresh, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") maybeRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [router, intervalMs]);

  return null;
}
