import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getSessionContext, UnauthorizedError } from "@/lib/api";
import { getOrganization } from "@/lib/services/orgs";
import { organizationsForUser } from "@/lib/services/accounts";
import { monthlyScanUsage } from "@/lib/services/audits";
import { effectivePlan } from "@/lib/plans";
import { ROLE_LABELS } from "@/lib/permissions";
import OrgSwitcher from "@/components/app/OrgSwitcher";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

const NAV = [
  ["Overview", "/app"],
  ["Clients", "/app/clients"],
  ["Team", "/app/team"],
  ["Settings", "/app/settings"],
  ["Plans", "/pricing"],
] as const;

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
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{org.name}</p>
          <p className="truncate text-xs text-ink-mute">
            {ctx.email} · {ROLE_LABELS[ctx.role]} · {plan.name} plan · {usedThisMonth} of {plan.scansPerMonth} scans used this month
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <OrgSwitcher orgs={orgs} activeId={ctx.organizationId} />
          <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="App">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg px-3 py-2 transition hover:bg-accent-soft hover:text-accent">
                {label}
              </Link>
            ))}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 transition hover:border-accent/50"
              >
                <LogOut size={15} aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
