"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";

/**
 * Live status island for the maintenance page: checks the public
 * health endpoint, and when maintenance is off again, counts down and
 * takes the visitor back automatically. Honest states only — "still
 * working on it" until the status endpoint itself says otherwise.
 */
export default function MaintenanceClient({ eta }: { eta: string | null }) {
  const [phase, setPhase] = useState<"checking" | "down" | "back">("checking");
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/maintenance-status", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
        if (!alive) return;
        if (json && json.enabled === false) {
          setPhase("back");
          setSeconds(5);
        } else {
          setPhase("down");
          setSeconds(30);
        }
      } catch {
        if (alive) { setPhase("down"); setSeconds(30); }
      }
    };
    void check();
    const id = setInterval(() => { void check(); }, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (phase !== "back") return;
    if (seconds <= 0) { window.location.href = "/"; return; }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, seconds]);

  return (
    <div className="mt-6 rounded-2xl bg-canvas px-4 py-3.5" role="status" aria-live="polite">
      {phase === "checking" && (
        <p className="flex items-center gap-2 text-sm text-ink-soft"><LoaderCircle size={15} className="animate-spin text-accent" aria-hidden /> Checking the live status…</p>
      )}
      {phase === "down" && (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <RefreshCw size={15} className="shrink-0 text-warn" aria-hidden />
          Still in maintenance{eta ? "" : ""} — this page re-checks automatically every 30 seconds.
        </p>
      )}
      {phase === "back" && (
        <p className="flex items-center gap-2 text-sm font-semibold text-good">
          <CheckCircle2 size={15} className="shrink-0" aria-hidden />
          We&apos;re back! Taking you home in {seconds}s…
        </p>
      )}
    </div>
  );
}
