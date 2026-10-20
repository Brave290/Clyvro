import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import {
  listAdminJobs, listAdminLog, listAdminOrgs, listAdminUsers, requireAdminUser,
} from "@/lib/services/admin";
import { getLegalRow, LEGAL_SLUGS } from "@/lib/services/legal";
import AdminConsole from "@/components/app/AdminConsole";

export const metadata: Metadata = { title: "Admin Control Center" };
export const dynamic = "force-dynamic";

/**
 * Clyvro Admin Control Center. Authorization is checked server-side
 * against the database user row on every load — a normal signed-in user
 * only ever sees the access-denied card.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?callbackUrl=/admin");

  let actor;
  try {
    actor = await requireAdminUser(session.user.id);
  } catch {
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <div className="rounded-2xl border border-warn/40 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} aria-hidden /> Administrator access required</p>
          <p className="mt-2 text-sm leading-relaxed">
            This area is restricted to Clyvro platform administrators. If you believe you should have
            access, ask the platform owner to add your account.
          </p>
          <p className="mt-4 text-sm"><Link href="/app/scan" className="font-semibold text-accent hover:underline">Back to your workspace</Link></p>
        </div>
      </div>
    );
  }

  const [users, orgs, jobs, log, legal] = await Promise.all([
    listAdminUsers(), listAdminOrgs(), listAdminJobs(), listAdminLog(),
    Promise.all(LEGAL_SLUGS.map(async (slug) => {
      const row = await getLegalRow(slug);
      return {
        slug, title: row?.title ?? (slug === "refund" ? "Refund policy" : slug),
        draftBody: row?.draftBody ?? "",
        published: Boolean(row?.publishedBody),
        publishedAt: row?.publishedAt?.toISOString() ?? null,
        revisions: Array.isArray(row?.revisions) ? (row.revisions as unknown[]).length : 0,
      };
    })),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-white"><ShieldCheck size={20} aria-hidden /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Control Center</h1>
          <p className="text-sm text-ink-mute">Signed in as {actor.email}. Every action here is written to the admin audit log.</p>
        </div>
        <Link href="/app/scan" className="button-secondary ml-auto">Back to workspace</Link>
      </header>
      <div className="mt-8">
        <AdminConsole data={{ users, orgs, jobs, log, legal }} />
      </div>
    </div>
  );
}
