"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, Trophy } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import type { PublicFeatureRequest } from "@/lib/services/feature-requests";

type Status = PublicFeatureRequest["status"];
const STATUS_LABELS: Record<Status, string> = {
  requested: "Requested", planned: "Planned", in_progress: "In progress", shipped: "Shipped", not_planned: "Not planned",
};
const STATUS_STYLE: Record<Status, string> = {
  requested: "bg-canvas text-ink-soft",
  planned: "bg-accent-soft text-accent",
  in_progress: "bg-warn-soft text-warn",
  shipped: "bg-good-soft text-good",
  not_planned: "bg-bad-soft text-bad",
};
const RANK_STYLE = ["bg-[#B45309] text-white", "bg-ink-mute text-white", "bg-[#92400E] text-white"];

/**
 * Public roadmap board — strictly READ-ONLY by design: it shows the
 * ranking and vote counts, but nothing here can be voted on, edited
 * or shared from. Voting and per-request invite links live inside the
 * signed-in dashboard (/app/feature-requests), where votes are tied
 * to real accounts — that's what keeps bots from stuffing the ballot.
 * An invite link (?r=<id>) still lands supporters on the highlighted
 * request; the actual vote happens after sign-in, in the app.
 */
export default function PublicFeatureBoard({ initial }: { initial: PublicFeatureRequest[] }) {
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("r");
    if (r) {
      setHighlight(r);
      requestAnimationFrame(() => {
        document.getElementById(`request-${r}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, []);

  const totalVotes = useMemo(() => initial.reduce((n, r) => n + r.votes, 0), [initial]);

  if (initial.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm leading-relaxed text-ink-soft">
        No requests yet — be the first to shape the roadmap.{" "}
        <Link href="/sign-up" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Create a free account</Link>{" "}
        and tell us what to build.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-soft" role="status">
        <strong className="text-ink">{initial.length}</strong> requests · <strong className="text-ink">{totalVotes}</strong> upvotes · ranked by votes
      </p>
      <ol className="mt-4 space-y-2">
        {initial.map((r, i) => {
          const isHighlighted = highlight === r.id;
          return (
            <li
              key={r.id}
              id={`request-${r.id}`}
              className={`rounded-2xl border bg-surface px-4 py-3.5 transition ${
                isHighlighted ? "border-accent ring-2 ring-accent/40" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    i < 3 ? RANK_STYLE[i] : "bg-canvas text-ink-mute"
                  }`}
                  aria-label={`Rank ${i + 1}`}
                  title={`Rank ${i + 1}`}
                >
                  {i < 3 ? <Trophy size={15} aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-ink">{r.title}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{r.category}</span>
                    {isHighlighted && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        You were invited to back this
                      </span>
                    )}
                  </span>
                  {r.details && <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{r.details}</span>}
                  <span className="mt-1 block text-xs text-ink-mute">Suggested <LocalDateTime value={r.createdAt} /></span>
                </span>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-canvas px-3.5 py-2 text-sm font-bold text-ink"
                  aria-label={`${r.votes} upvotes`}
                  title="Upvotes — voting happens inside your free Clyvro account, not on this public page"
                >
                  <ArrowUp size={15} aria-hidden /> {r.votes}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-ink-mute">
        This public board is read-only on purpose: voting happens inside a free Clyvro account (one vote per
        person, tied to a real account) so bots can&apos;t stuff the ballot.{" "}
        <Link href="/sign-up" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Create a free account</Link>{" "}
        to vote and to get your own per-request invite links to share.
      </p>
    </div>
  );
}
