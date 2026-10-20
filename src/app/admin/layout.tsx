import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import { requireAdminUser } from "@/lib/services/admin";
import AdminNav from "@/components/app/AdminNav";

export const metadata: Metadata = { title: "Admin Control Center" };
export const dynamic = "force-dynamic";

/**
 * Admin Control Center shell. Authorization is checked server-side
 * against the database user row on every load — a normal signed-in user
 * only ever sees the access-denied card. The public site nav/footer are
 * suppressed on /admin routes (see Nav/SiteFooter), so this sidebar is
 * the only chrome here.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="min-h-screen bg-canvas">
      <AdminNav email={actor.email} />
      <div className="lg:pl-64">
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Admin Control Center</h1>
            <p className="mt-1 text-sm text-ink-mute">Signed in as {actor.email}. Every action here is written to the admin audit log.</p>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
