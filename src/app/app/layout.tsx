import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { effectivePlan } from "@/lib/plans";
import { monthlyScanUsage } from "@/lib/services/audits";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) redirect("/sign-in");

  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.user.organizationId)).limit(1);
  const plan = effectivePlan(org?.planId);
  const usedThisMonth = await monthlyScanUsage(session.user.organizationId);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{org?.name ?? "Workspace"}</p>
          <p className="truncate text-xs text-ink-mute">
            {session.user.email} · {plan.name} plan · {usedThisMonth} of {plan.scansPerMonth} scans used this month
          </p>
        </div>
        <nav className="ml-auto flex items-center gap-2 text-sm font-semibold" aria-label="App">
          <Link href="/app" className="rounded-lg px-3 py-2 transition hover:bg-accent-soft hover:text-accent">
            Projects
          </Link>
          <Link href="/pricing" className="rounded-lg px-3 py-2 transition hover:bg-accent-soft hover:text-accent">
            Plans
          </Link>
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
      {children}
    </div>
  );
}
