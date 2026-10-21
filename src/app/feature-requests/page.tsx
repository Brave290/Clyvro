import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lightbulb, Megaphone } from "lucide-react";
import Reveal from "@/components/Reveal";
import PublicFeatureBoard from "@/components/PublicFeatureBoard";
import { listFeatureRequestsPublic, type PublicFeatureRequest } from "@/lib/services/feature-requests";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Roadmap — vote on what Clyvro builds next",
  description:
    "The public Clyvro roadmap: feature requests from real users, ranked by upvotes. Read the board, invite people to vote for what you need, and watch requests move from Requested to Shipped.",
  alternates: { canonical: "/feature-requests" },
};

/**
 * Public upvote board. Anyone can see the ranking; voting needs a
 * free account (one vote per person). Suggesting happens in the app;
 * every request gets an invite link so its supporters can rally votes.
 */
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
          <Lightbulb size={14} aria-hidden /> Public roadmap
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">What should Clyvro build next? You rank it.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Every feature request from our users, ranked by upvotes — the top of this board is what gets built first.
          This page is read-only: voting happens inside a free account so the ranking can&apos;t be gamed. See something
          you need?{" "}
          <Link href="/sign-up" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Create a free account</Link>,
          vote in your dashboard, then share its <strong className="text-ink">Invite voters</strong> link so your people
          can push it up the ranking.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/app/feature-requests" className="button-primary">
            Suggest a feature <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href="/changelog" className="button-secondary">See what already shipped</Link>
        </div>
      </Reveal>

      <Reveal className="mt-8">
        <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft/40 p-5">
          <Megaphone size={19} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-soft">
            <strong className="text-ink">How inviting works:</strong> inside your account, each request on the
            dashboard board has an <em>Invite voters</em> button that copies a personal link. Anyone who opens it lands
            on this public board with your request highlighted, then signs up free and votes from their dashboard.
            One vote per account — no public vote buttons, so bots can&apos;t stuff the ballot.
          </p>
        </div>
      </Reveal>

      <div className="mt-10">
        {loadError ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-soft" role="status">
            The board couldn&apos;t load just now. Please try again in a moment — your requests and votes are safe.
          </p>
        ) : (
          <PublicFeatureBoard initial={rows} />
        )}
      </div>
    </div>
  );
}
