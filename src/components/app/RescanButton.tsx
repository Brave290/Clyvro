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
}: {
  url: string;
  mode?: ScanMode | string | null;
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
      aria-label={`Scan ${url} again`}
      title="Scan again"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-mute transition hover:bg-canvas hover:text-accent disabled:opacity-50"
    >
      {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />}
    </button>
  );
}
