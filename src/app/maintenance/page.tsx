import { getMaintenance } from "@/lib/services/site";
import LocalDateTime from "@/components/LocalDateTime";
import MaintenanceClient from "@/components/MaintenanceClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "We'll be right back",
  description: "Clyvro is briefly down for maintenance. Your scans, reports and account are safe.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Maintenance page. Shown when an admin enables maintenance mode
 * (Admin → Maintenance); also reachable directly for preview. The
 * client island pings the public health endpoint and counts down to an
 * automatic re-check, so visitors return the moment we're back.
 */
export default async function MaintenancePage() {
  const maintenance = await getMaintenance(undefined, true);
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
      <div className="rounded-3xl border border-line bg-surface p-8 shadow-sm sm:p-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-warn">
          Maintenance in progress
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">We&apos;ll be right back</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">{maintenance.message}</p>
        {maintenance.eta && (
          <p className="mt-4 text-sm text-ink-soft">
            Expected back: <strong className="text-ink"><LocalDateTime value={maintenance.eta} /></strong>
          </p>
        )}
        <MaintenanceClient eta={maintenance.eta} />
        <div className="mt-8 border-t border-line pt-5 text-sm text-ink-mute">
          <p>Your scans, reports and workspace are stored safely — nothing is lost during maintenance.</p>
          <p className="mt-2">Already have an account? <a href="/sign-in" className="font-semibold text-accent hover:underline">Sign-in stays available</a> for the team during maintenance.</p>
        </div>
      </div>
    </div>
  );
}
