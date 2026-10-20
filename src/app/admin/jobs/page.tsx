import { listAdminJobs } from "@/lib/services/admin";
import { AdminJobs } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  const jobs = await listAdminJobs();
  return <AdminJobs jobs={jobs} />;
}
