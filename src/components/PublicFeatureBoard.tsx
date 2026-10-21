"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, Link2, Trophy } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { useToast } from "@/components/Toast";
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
 * Public roadmap board: anyone can read the ranking; voting needs a
 * free account (one vote per person — rankings stay honest). Every
 * request carries an invite link: share it, and people who sign up
 * through it land right back on your request to upvote it.
 */
export default function PublicFeatureBoard({ initial }: { initial: PublicFeatureRequest[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("r");
    if (r) {
      setHighlight(r);
      requestAnimationFrame(() => {
        document.getElementById(`request-${r}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    void (async () => {
      try {
        const res = await fetch("/api/feature-requests");
        if (!res.ok) { setSignedIn(false); return; }
        const json = await res.json().catch(() => null);
        const mine = new Set<string>(
          ((json?.requests ?? []) as { id: string; votedByMe: boolean }[])
            .filter((x) => x.votedByMe).map((x) => x.id),
        );
        setVoted(mine);
        setSignedIn(true);
      } catch {
        setSignedIn(false);
      }
    })();
  }, []);

  const inviteUrl = useCallback((id: string) => `${window.location.origin}/feature-requests?r=${id}`, []);

  async function copyInvite(id: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(id));
      setCopiedId(id);
      toast("success", "Invite link copied", "Share it anywhere — voters land right on this request.");
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2500);
    } catch {
      toast("error", "Couldn't copy", "Copy the address bar link instead — it points at this board.");
    }
  }

  async function vote(row: PublicFeatureRequest) {
    if (!signedIn) return; // the Link handles anonymous visitors
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/feature-requests/${row.id}/vote`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Vote failed.");
      setRows((prev) => prev
        .map((r) => (r.id === row.id ? { ...r, votes: json.votes as number } : r))
        .sort((a, b) => (b.votes - a.votes) || b.createdAt.localeCompare(a.createdAt)));
      setVoted((prev) => {
        const next = new Set(prev);
        if (json.votedByMe) next.add(row.id); else next.delete(row.id);
        return next;
      });
    } catch (err) {
      toast("error", "Vote failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const totalVotes = useMemo(() => rows.reduce((n, r) => n + r.votes, 0), [rows]);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm leading-relaxed text-ink-soft">
        No requests yet — be the first to shape the roadmap.{" "}
        <Link href="/sign-up" className="font-semibold text-accent hover:underline">Create a free account</Link>{" "}
        and tell us what to build.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-soft" role="status">
        <strong className="text-ink">{rows.length}</strong> requests · <strong className="text-ink">{totalVotes}</strong> upvotes · ranked by votes, updated live
      </p>
      <ol className="mt-4 space-y-2">
        {rows.map((r, i) => {
          const isVoted = voted.has(r.id);
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
                        You were invited to vote for this
                      </span>
                    )}
                  </span>
                  {r.details && <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{r.details}</span>}
                  <span className="mt-1 block text-xs text-ink-mute">Suggested <LocalDateTime value={r.createdAt} /></span>
                </span>
                <span className="flex shrink-0 flex-col items-stretch gap-1.5">
                  {signedIn ? (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void vote(r)}
                      aria-pressed={isVoted}
                      className={`flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                        isVoted ? "bg-accent text-white" : "bg-canvas text-ink hover:bg-accent-soft"
                      }`}
                    >
                      <ArrowUp size={15} aria-hidden /> {r.votes}
                      <span className="sr-only">upvotes for {r.title}</span>
                    </button>
                  ) : (
                    <Link
                      href={`/sign-in?callbackUrl=${encodeURIComponent(`/feature-requests?r=${r.id}`)}`}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-canvas px-3.5 py-2 text-sm font-bold text-ink transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      title="Sign in (free) to upvote"
                    >
                      <ArrowUp size={15} aria-hidden /> {r.votes}
                      <span className="sr-only">Sign in to upvote {r.title}</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyInvite(r.id)}
                    className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    title="Copy an invite link that lands voters on this request"
                  >
                    {copiedId === r.id ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
                    {copiedId === r.id ? "Copied!" : "Invite voters"}
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-ink-mute">
        Voting needs a free account — one vote per person keeps the ranking honest (no bots, no ballot-stuffing).
        Invited friends sign up free, land back here, and their tap moves your request up the board.
      </p>
    </div>
  );
}
