import ScheduleManager from "@/components/app/ScheduleManager";
import CronJobManager from "@/components/app/CronJobManager";

export const dynamic = "force-dynamic";

export default function SchedulesPage() {
  return (
    <div className="mt-8 space-y-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Schedules & cron</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Recurring website checks for saved projects, plus your own HTTP cron jobs — all run by Clyvro&apos;s scheduler.
        </p>
      </header>
      <ScheduleManager />
      <CronJobManager />
    </div>
  );
}
