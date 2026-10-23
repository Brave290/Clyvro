import { redirect } from "next/navigation";
import { getSessionContext, UnauthorizedError } from "@/lib/api";
import { getOrganization } from "@/lib/services/orgs";
import { organizationsForUser } from "@/lib/services/accounts";
import { monthlyScanUsage } from "@/lib/services/audits";
import { effectivePlanForOrg } from "@/lib/plans";
import { requireAdminUser } from "@/lib/services/admin";
import { ROLE_LABELS } from "@/lib/permissions";
import WorkspaceSidebar from "@/components/app/WorkspaceSidebar";
import LiveRefresh from "@/components/app/LiveRefresh";
import AuthToast from "@/components/AuthToast";
import { toolAccessSummary, type ToolKey } from "@/lib/services/tool-access";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await getSessionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/sign-in");
    throw err;
  }

  const [org, orgs, usedThisMonth] = await Promise.all([
    getOrganization(ctx.organizationId),
    organizationsForUser(ctx.userId),
    monthlyScanUsage(ctx.organizationId),
  ]);
  const plan = effectivePlanForOrg(org);
  const isAdmin = await requireAdminUser(ctx.userId).then(() => true).catch(() => false);
  const toolSummary = await toolAccessSummary(ctx.organizationId).catch(() => []);
  const toolUsage: Partial<Record<ToolKey, { remaining: number | null; limit: number | null }>> = {};
  for (const entry of toolSummary) toolUsage[entry.tool] = { remaining: entry.remaining, limit: entry.limit };

  return (
    <div className="min-h-screen bg-canvas">
      <WorkspaceSidebar
        isAdmin={isAdmin}
        orgName={org.name}
        orgs={orgs}
        activeId={ctx.organizationId}
        email={ctx.email}
        roleLabel={ROLE_LABELS[ctx.role]}
        planName={plan.name}
        planId={plan.id}
        scansUsed={usedThisMonth}
        scansLimit={plan.scansPerMonth}
        toolUsage={toolUsage}
      />
      <div className="lg:pl-64">
        <div className="mx-auto w-full min-w-0 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <LiveRefresh />
          <AuthToast />
          {children}
        </div>
      </div>
    </div>
  );
}
