import ScheduleManager from "@/components/app/ScheduleManager";

export const dynamic = "force-dynamic";

export default function SchedulesPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Monitoring schedules</h1>
      <p className="mt-1 text-sm text-ink-mute">Manage recurring scans for saved websites in this workspace.</p>
      <ScheduleManager />
    </div>
  );
}
