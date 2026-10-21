"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronUp, Lightbulb, Link2, LoaderCircle, Send, Trash2 } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { BrandSelect } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface FeatureRequest {
  id: string; title: string; details: string; category: string; status: string;
  votes: number; votedByMe: boolean; mine: boolean; authorLabel: string; createdAt: string;
}

const CATEGORIES = [
  { value: "scanner", label: "Website scanner" },
  { value: "reports", label: "Reports & exports" },
  { value: "tools", label: "Tools (Readiness, Hack, SEO, Dev Tools)" },
  { value: "billing", label: "Billing & plans" },
  { value: "integrations", label: "Integrations" },
  { value: "other", label: "Something else" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "shipped", label: "Shipped" },
  { value: "not_planned", label: "Not planned" },
];
const STATUS_STYLE: Record<string, string> = {
  requested: "bg-canvas text-ink-soft",
  planned: "bg-accent-soft text-accent-deep",
  in_progress: "bg-warn-soft text-warn",
  shipped: "bg-good-soft text-good",
  not_planned: "bg-canvas text-ink-mute",
};

export default function FeatureRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("scanner");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/feature-requests");
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setRequests(json.requests as FeatureRequest[]);
      setIsAdmin(Boolean(json.isPlatformAdmin));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Keep the board live (votes + statuses) without a manual refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("submit");
    setError(null);
    try {
      const res = await fetch("/api/feature-requests", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, details, category }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't save your request.");
      setTitle("");
      setDetails("");
      toast("success", "Request posted", "It's on the board with your upvote. Statuses are updated by the Clyvro team.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your request.");
    } finally {
      setBusy(null);
    }
  }

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Invite links live here in the dashboard (not on the public page):
  // the link lands supporters on the highlighted public request, and
  // the vote itself happens in their own account — bot-resistant.
  async function copyInvite(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/feature-requests?r=${id}`);
      setCopiedId(id);
      toast("success", "Invite link copied", "Share it anywhere — supporters land on this request, sign up free, and vote from their dashboard.");
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2500);
    } catch {
      toast("error", "Couldn't copy", "Your browser blocked clipboard access — copy the public board link and add ?r=" + id);
    }
  }

  async function vote(id: string) {
    setBusy(`vote-${id}`);
    try {
      const res = await fetch(`/api/feature-requests/${id}/vote`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Vote failed.");
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, votes: json.votes as number, votedByMe: json.votedByMe as boolean } : r)));
    } catch (err) {
      toast("error", "Vote failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function removeVote(id: string) {
    setBusy(`unvote-${id}`);
    try {
      const res = await fetch(`/api/feature-requests/${id}/vote`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't delete your upvote.");
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, votes: json.votes as number, votedByMe: false } : r)));
      toast("success", "Upvote deleted", "Your vote no longer counts toward this request.");
    } catch (err) {
      toast("error", "Couldn't delete upvote", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(`status-${id}`);
    try {
      const res = await fetch(`/api/feature-requests/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Status update failed.");
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast("success", "Status updated", "The board now shows the new status.");
    } catch (err) {
      toast("error", "Status update failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Feature requests
          <span className="rounded-full bg-good px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Tell us what Clyvro should build next — and upvote what other workspaces are asking for. Every request gets an
          honest status from the team: <strong className="text-ink">Planned</strong> means it&apos;s on the roadmap,{" "}
          <strong className="text-ink">Shipped</strong> is only set when it&apos;s actually live (and in the public changelog).
          Nothing is promised silently.
        </p>
      </header>

      <form onSubmit={submit} aria-busy={busy === "submit"} className="form-panel mt-6">
        <h2 className="flex items-center gap-2 font-semibold"><Lightbulb size={16} className="text-accent" aria-hidden /> Request a feature</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_240px]">
          <div>
            <label htmlFor="fr-title" className="form-label">What should Clyvro do? <span className="text-bad" aria-hidden="true">*</span></label>
            <input id="fr-title" required minLength={4} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Email me when a scheduled scan finds a new critical issue" className="form-control mt-1.5" disabled={busy !== null} />
          </div>
          <div>
            <label htmlFor="fr-category" className="form-label">Area</label>
            <BrandSelect id="fr-category" className="mt-1.5" value={category} onChange={setCategory} options={CATEGORIES} />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="fr-details" className="form-label">Why would it help? (the problem it solves, how often it bites)</label>
          <textarea id="fr-details" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="Describe the workflow it improves — specifics help us build the right thing." className="form-control mt-1.5" disabled={busy !== null} />
        </div>
        {error && <p role="alert" className="form-error mt-3">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={busy !== null || title.trim().length < 4} className="button-primary">
            {busy === "submit" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />}
            Post request
          </button>
        </div>
      </form>

      <section aria-label="Feature request board" className="mt-8">
        <h2 className="text-lg font-bold">The board <span className="text-sm font-medium text-ink-mute">(most upvoted first)</span></h2>
        {requests.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-mute">
            No requests yet — yours could be the first. Tell us what would save you the most time.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex items-start gap-3">
                  <button type="button" disabled={busy !== null} onClick={() => void vote(r.id)}
                    aria-pressed={r.votedByMe} aria-label={`${r.votedByMe ? "Remove your upvote from" : "Upvote"}: ${r.title}`}
                    className={`flex shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                      r.votedByMe ? "border-accent bg-accent text-white" : "border-line bg-canvas text-ink-soft hover:border-accent/50 hover:text-ink"
                    }`}>
                    <ChevronUp size={14} aria-hidden />
                    {r.votes}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">
                      {r.title}
                      {r.mine && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-deep">Yours</span>}
                    </p>
                    {r.details && <p className="mt-1 break-words text-sm leading-relaxed text-ink-soft">{r.details}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.requested}`}>
                        {STATUSES.find((s) => s.value === r.status)?.label ?? "Requested"}
                      </span>
                      <span>{CATEGORY_LABEL[r.category] ?? "Something else"}</span>
                      <span>{r.authorLabel}</span>
                      <span><LocalDateTime value={r.createdAt} format="date" /></span>
                      <button type="button" onClick={() => void copyInvite(r.id)}
                        className="inline-flex items-center gap-1 font-semibold text-accent transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded"
                        title="Copy a public invite link that lands supporters on this request">
                        {copiedId === r.id ? <Check size={12} aria-hidden /> : <Link2 size={12} aria-hidden />}
                        {copiedId === r.id ? "Copied!" : "Invite voters"}
                      </button>
                      {r.votedByMe && (
                        <button type="button" disabled={busy !== null} onClick={() => void removeVote(r.id)}
                          className="inline-flex items-center gap-1 font-semibold text-bad transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded disabled:opacity-60"
                          title="Delete your upvote from this request"
                          aria-label={`Delete your upvote from: ${r.title}`}>
                          <Trash2 size={12} aria-hidden />
                          {busy === `unvote-${r.id}` ? "Deleting…" : "Delete my upvote"}
                        </button>
                      )}
                    </p>
                    {isAdmin && (
                      <div className="mt-3 flex items-center gap-2">
                        <label htmlFor={`fr-status-${r.id}`} className="text-xs font-medium text-ink-mute">Team status:</label>
                        <BrandSelect id={`fr-status-${r.id}`} className="w-[170px]" value={r.status}
                          onChange={(v) => void setStatus(r.id, v)} options={STATUSES} />
                        {busy === `status-${r.id}` && <LoaderCircle size={13} className="animate-spin text-accent" aria-hidden />}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
