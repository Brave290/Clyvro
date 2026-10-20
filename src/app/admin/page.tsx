import { listAdminJobs, listAdminLog, listAdminOrgs, listAdminUsers } from "@/lib/services/admin";
import { AdminOverview } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

/** Admin overview: counts + latest activity. Sections live in the sidebar. */
export default async function AdminOverviewPage() {
  const [users, orgs, jobs, log] = await Promise.all([
    listAdminUsers(), listAdminOrgs(), listAdminJobs(), listAdminLog(),
  ]);
  return <AdminOverview data={{ users, orgs, jobs, log, legal: [] }} />;
}
