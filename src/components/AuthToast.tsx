"use client";

import { useEffect } from "react";
import { useToast } from "@/components/Toast";

/**
 * One-shot auth confirmation toasts. Auth flows (sign-in, sign-out,
 * registration, Google handoff) stash a message in sessionStorage right
 * before navigating; the destination page mounts this and shows it
 * exactly once. Keys are namespaced and always cleared after reading.
 */
export const AUTH_TOAST_KEY = "clyvro.authToast";

export function stashAuthToast(title: string, body?: string) {
  try {
    window.sessionStorage.setItem(AUTH_TOAST_KEY, JSON.stringify({ title, body }));
  } catch { /* storage unavailable — toast is a nicety, never load-bearing */ }
}

export default function AuthToast() {
  const { toast } = useToast();
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(AUTH_TOAST_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(AUTH_TOAST_KEY);
      const parsed = JSON.parse(raw) as { title?: string; body?: string };
      if (parsed.title) toast("success", parsed.title, parsed.body);
    } catch { /* ignore malformed stash */ }
  }, [toast]);
  return null;
}
