import { listAdminJobs, listAdminLog, listAdminOrgs, listAdminUsers } from "@/lib/services/admin";
import { listDispatchRuns } from "@/lib/services/dispatch";
import { AdminOverview } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

/** Admin overview: counts + latest activity. Sections live in the sidebar. */
export default async function AdminOverviewPage() {
  const [users, orgs, jobs, log, runs] = await Promise.all([
    listAdminUsers(), listAdminOrgs(), listAdminJobs(), listAdminLog(), listDispatchRuns(50),
  ]);
  return <AdminOverview data={{ users, orgs, jobs, log, legal: [] }}
    cron={{ runs: runs.length, lastTrigger: runs[0]?.trigger ?? null, lastAt: runs[0]?.createdAt ?? null }} />;
}
