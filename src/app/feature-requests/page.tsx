import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lightbulb, Megaphone } from "lucide-react";
import Reveal from "@/components/Reveal";
import PublicFeatureBoard from "@/components/PublicFeatureBoard";
import { listFeatureRequestsPublic, type PublicFeatureRequest } from "@/lib/services/feature-requests";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "What should we build next? You decide.",
  description:
    "See what other Clyvro users are asking for, vote for what matters to you, and watch the most-wanted ideas get built first.",
  alternates: { canonical: "/feature-requests" },
};

export default async function PublicFeatureRequestsPage() {
  let rows: PublicFeatureRequest[] = [];
  let loadError = false;
  try {
    rows = await listFeatureRequestsPublic();
  } catch {
    loadError = true;
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <Reveal>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <Lightbulb size={14} aria-hidden /> You shape Clyvro
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">What should we build next? You rank it.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          These are ideas from real Clyvro users — ranked by votes. The ones at the top get built first.
          See something you need for your business?{" "}
          <Link href="/sign-up" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Create a free account</Link>,
          vote inside your dashboard, then share your <strong className="text-ink">Invite voters</strong> link with friends or your team to push it up the list.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/app/feature-requests" className="button-primary">
            Suggest an idea <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href="/changelog" className="button-secondary">See what we've already built</Link>
        </div>
      </Reveal>

      <Reveal className="mt-8">
        <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft/40 p-5">
          <Megaphone size={19} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-soft">
            <strong className="text-ink">How to rally votes:</strong> inside your account, every idea has an <em>Invite voters</em> button.
            It copies a personal link — anyone who opens it lands here, sees your idea highlighted, signs up free, and can vote for it.
            One person, one vote — so no one can game it with bots.
          </p>
        </div>
      </Reveal>

      <div className="mt-10">
        {loadError ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft" role="status">
            The board couldn't load just now. Please try again in a moment — your ideas and votes are safe.
          </p>
        ) : (
          <PublicFeatureBoard initial={rows} />
        )}
      </div>
    </div>
  );
}
