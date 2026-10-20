import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getSessionContext, UnauthorizedError } from "@/lib/api";
import { getOrganization } from "@/lib/services/orgs";
import { organizationsForUser } from "@/lib/services/accounts";
import { monthlyScanUsage } from "@/lib/services/audits";
import { effectivePlan } from "@/lib/plans";
import { ROLE_LABELS } from "@/lib/permissions";
import WorkspaceSidebar from "@/components/app/WorkspaceSidebar";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/sign-in" });
}

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
  const plan = effectivePlan(org.planId);

  return (
    <div className="min-h-screen bg-canvas">
      <WorkspaceSidebar
        orgName={org.name}
        orgs={orgs}
        activeId={ctx.organizationId}
        email={ctx.email}
        roleLabel={ROLE_LABELS[ctx.role]}
        planName={plan.name}
        scansUsed={usedThisMonth}
        scansLimit={plan.scansPerMonth}
        signOutAction={signOutAction}
      />
      <div className="lg:pl-72">
        <div className="mx-auto max-w-7xl px-5 pb-12 lg:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
