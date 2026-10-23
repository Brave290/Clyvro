import CronJobManager from "@/components/app/CronJobManager";
import ScheduleManager from "@/components/app/ScheduleManager";

export const dynamic = "force-dynamic";

export default function CronJobsPage() {
  return (
    <div className="mt-8 space-y-10">
      <CronJobManager />
      <ScheduleManager />
    </div>
  );
}
