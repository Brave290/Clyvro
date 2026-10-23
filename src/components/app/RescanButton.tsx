"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { ScanMode } from "@/lib/scan-modes";

/**
 * Icon-only re-run of a saved check — same URL and depth, new report.
 * Stops people copying the address back into Scan.
 */
export default function RescanButton({
  url,
  mode = "normal",
  onRetry,
}: {
  url: string;
  mode?: ScanMode | string | null;
  /** When set, runs this instead of starting a website check. */
  onRetry?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const scanMode = mode === "strict" || mode === "deep" ? mode : "normal";

  async function run(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (onRetry) {
        await onRetry();
        setBusy(false);
        return;
      }
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          auditTypes: ["generic"],
          locale: typeof navigator !== "undefined" ? navigator.language : undefined,
          mode: scanMode,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't start the scan.");
      toast("success", "Scan queued");
      router.push(`/app/audits/${data.auditId}`);
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't start the scan.");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void run(e)}
      disabled={busy}
      aria-label={`Run ${url} again`}
      title="Run again"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent shadow-sm transition hover:border-accent hover:bg-accent-soft disabled:opacity-50"
    >
      {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RotateCcw size={15} aria-hidden />}
    </button>
  );
}
