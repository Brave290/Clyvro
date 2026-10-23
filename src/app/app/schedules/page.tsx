import CronJobManager from "@/components/app/CronJobManager";

export const dynamic = "force-dynamic";

export default function CronJobsPage() {
  return (
    <div className="mt-8">
      <CronJobManager />
    </div>
  );
}
