import { auth } from "@/auth";
import { listAdminJobs, listAdminLog, listAdminOrgs, listAdminUsers } from "@/lib/services/admin";
import { listDispatchRuns } from "@/lib/services/dispatch";
import { listFeatureRequestsForAdmin } from "@/lib/services/feature-requests";
import { AdminOverview } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

/** Admin overview: counts + latest activity. Sections live in the sidebar. */
export default async function AdminOverviewPage() {
  const session = await auth();
  const [users, orgs, jobs, log, runs, featureRows] = await Promise.all([
    listAdminUsers(), listAdminOrgs(), listAdminJobs(), listAdminLog(), listDispatchRuns(50),
    listFeatureRequestsForAdmin(session?.user?.id ?? "").catch(() => []),
  ]);
  const features = {
    total: featureRows.length,
    votes: featureRows.reduce((n, r) => n + r.votes, 0),
    awaiting: featureRows.filter((r) => r.status === "requested").length,
    top: featureRows.slice(0, 5).map((r) => ({ id: r.id, title: r.title, votes: r.votes, status: r.status })),
  };
  return <AdminOverview data={{ users, orgs, jobs, log, legal: [] }} features={features}
    cron={{ runs: runs.length, lastTrigger: runs[0]?.trigger ?? null, lastAt: runs[0]?.createdAt ?? null }} />;
}
