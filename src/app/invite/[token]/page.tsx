import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getInvitationPreview } from "@/lib/services/team";
import { ROLE_LABELS } from "@/lib/permissions";
import AcceptInviteButton from "@/components/app/AcceptInviteButton";
import { MailCheck, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "You're invited | Clyvro",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitationPreview(token);
  const session = await auth();

  if (!preview) {
    return (
      <div className="mx-auto max-w-md px-5 py-16">
        <div className="rounded-2xl border border-warn/30 bg-warn-soft p-8 text-center" role="alert">
          <ShieldAlert size={28} className="mx-auto text-warn" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">This invite isn&apos;t valid anymore</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            It may have expired, been cancelled, or already been used. Ask the person who sent it for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  const emailMatches = !!session?.user?.email && session.user.email.toLowerCase() === preview.email;

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <MailCheck size={28} className="mx-auto text-accent" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold">Join {preview.organizationName} on Clyvro</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          You&apos;ve been invited as a <strong className="text-ink">{ROLE_LABELS[preview.role]}</strong>.
          This invite is for <strong className="text-ink">{preview.email}</strong> only.
        </p>
        {session?.user ? (
          emailMatches ? (
            <>
              <AcceptInviteButton token={token} />
              <p className="mt-3 text-xs text-ink-mute">You&apos;re signed in as {session.user.email}.</p>
            </>
          ) : (
            <p className="mt-5 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm" role="alert">
              You&apos;re signed in as {session.user.email}, but this invite is for {preview.email}.
              Sign out and sign in with that account to accept.
            </p>
          )
        ) : (
          <div className="mt-6 flex flex-col gap-2.5">
            <Link href={`/sign-up`} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover">
              Create your free account
            </Link>
            <Link href={`/sign-in?callbackUrl=/invite/${token}`} className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold transition hover:border-accent/50">
              I already have an account
            </Link>
            <p className="text-xs text-ink-mute">After signing in, open this invite link again to join.</p>
          </div>
        )}
      </div>
    </div>
  );
}
