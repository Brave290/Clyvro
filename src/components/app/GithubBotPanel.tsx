"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, ExternalLink, FolderGit2, LoaderCircle, Play, RefreshCw, ScanSearch, Unplug } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { ConfirmDialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import type { RepoReviewReport } from "@/lib/code-review-repo-shared";

export interface RepoReviewDetail {
  id: string;
  fullName: string;
  commitSha: string | null;
  trigger: string;
  createdAt: string;
  report: RepoReviewReport;
}

interface RepoView {
  id: string;
  fullName: string;
  defaultBranch: string;
  lastScannedAt: string | null;
  lastScannedSha: string | null;
  latestSeenSha: string | null;
  scanDue: boolean;
  latestReview: { id: string; score: number; counts: { critical: number; high: number; medium: number; low: number }; createdAt: string } | null;
}

interface ConnectionStatus {
  configured: boolean;
  slug: string | null;
  installation: { id: string; accountLogin: string; accountType: string; createdAt: string } | null;
  repos: RepoView[];
}

interface AvailableRepo { fullName: string; defaultBranch: string; private: boolean; registered: boolean }

/**
 * Code Reviewer bot panel: connect the GitHub App installation,
 * register repos, run whole-repo reviews, open the detailed scan.
 * Everything here is gated on the server-side GITHUB_APP_* config —
 * unconfigured deployments get an honest explanation, never a dead
 * install button.
 */
export function GithubBotPanel({ onOpenReview }: { onOpenReview: (detail: RepoReviewDetail) => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [available, setAvailable] = useState<AvailableRepo[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/code-reviews/github").then((r) => r.json()).catch(() => null);
    if (res && typeof res.configured === "boolean") {
      setStatus(res as ConnectionStatus);
      setLoadError(null);
    } else {
      setLoadError(res?.error?.message ?? "Couldn't load the GitHub connection state.");
    }
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const loadAvailable = useCallback(async () => {
    const res = await fetch("/api/code-reviews/github/repos").then((r) => r.json()).catch(() => null);
    if (res?.repos) {
      setAvailable(res.repos as AvailableRepo[]);
      const first = (res.repos as AvailableRepo[]).find((r) => !r.registered);
      setPick(first?.fullName ?? "");
    }
  }, []);
  useEffect(() => {
    if (status?.installation) void loadAvailable();
  }, [status?.installation, loadAvailable]);

  async function addRepo() {
    if (!pick) return;
    setBusy("add-repo");
    try {
      const res = await fetch("/api/code-reviews/github/repos", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: pick }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't register that repository.");
      toast("success", "Repository registered", `${pick} is ready for its first full-repo review.`);
      await loadStatus();
    } catch (err) {
      toast("error", "Couldn't register repository", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openDetail(reviewId: string) {
    const res = await fetch(`/api/code-reviews/github/reviews/${reviewId}`).then((r) => r.json()).catch(() => null);
    if (res?.review) onOpenReview(res.review as RepoReviewDetail);
    else toast("error", "Couldn't open the detailed scan", res?.error?.message ?? "Please try again.");
  }

  async function scan(repo: RepoView) {
    setBusy(`scan-${repo.id}`);
    try {
      const res = await fetch(`/api/code-reviews/github/repos/${repo.id}/scan`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The repo review couldn't run.");
      toast("success", "Repo review complete", `${repo.fullName}: score ${json.report.score}/100 across ${json.report.filesScanned} files.`);
      await loadStatus();
      await openDetail(json.id as string);
    } catch (err) {
      toast("error", "Repo review failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setConfirmDisconnect(false);
    setBusy("disconnect");
    try {
      const res = await fetch("/api/code-reviews/github", { method: "DELETE" });
      if (!res.ok) throw new Error("Disconnect failed.");
      toast("success", "GitHub disconnected", "The installation link, registered repos, and saved repo reviews were removed. Uninstall the bot on GitHub too if you're done with it.");
      await loadStatus();
    } catch (err) {
      toast("error", "Couldn't disconnect", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="GitHub bot" className="form-panel mt-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Bot size={18} className="text-accent" aria-hidden /> GitHub bot — whole-repo reviews
      </h2>

      {status === null && !loadError && (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading GitHub connection">
          <div className="h-5 w-64 max-w-full animate-pulse rounded bg-line/60" />
          <div className="h-24 animate-pulse rounded-2xl bg-line/50" />
        </div>
      )}
      {loadError && <p role="alert" className="form-error mt-4">{loadError}</p>}

      {status && !status.configured && (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          <p>
            Install the Clyvro bot on a GitHub account and it can review <strong className="text-ink">every
            reviewable file in a repository</strong> — same deterministic, line-evidence engine as the paste
            checker below, with a per-file detailed scan here on the web.
          </p>
          <p className="rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed">
            The bot isn&apos;t switched on for this deployment yet: the GitHub App credentials
            (<code className="font-mono">GITHUB_APP_ID</code>, <code className="font-mono">GITHUB_APP_PRIVATE_KEY</code>,{" "}
            <code className="font-mono">GITHUB_APP_SLUG</code>, <code className="font-mono">GITHUB_APP_WEBHOOK_SECRET</code>)
            haven&apos;t been configured by the workspace operator, so there&apos;s no install button to click.
            The paste checker below works in the meantime.
          </p>
        </div>
      )}

      {status?.configured && !status.installation && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
          <p>
            Install the Clyvro bot on your GitHub account (or organisation), pick the repositories it may
            read, and GitHub sends you back here to finish connecting. The bot reads code with a
            Contents:Read-only installation token; <strong className="text-ink">your source is analysed in
            memory and never stored</strong> — only findings are saved, exactly like the paste checker.
          </p>
          <a
            href={`https://github.com/apps/${encodeURIComponent(status.slug ?? "")}/installations/new`}
            target="_blank"
            rel="noreferrer"
            className="button-primary"
          >
            <Bot size={15} aria-hidden /> Install the Clyvro bot on GitHub <ExternalLink size={13} aria-hidden />
          </a>
          <p className="text-xs text-ink-mute">
            Choose &ldquo;Only select repositories&rdquo; on GitHub to control exactly what the bot can read.
            Pushes to a registered repo&apos;s default branch flag it here as &ldquo;scan due&rdquo; — reviews
            only ever run when you press the button, never silently against your quota.
          </p>
        </div>
      )}

      {status?.installation && (
        <div className="mt-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-good/10 px-2.5 py-1 text-xs font-bold text-good">
              <FolderGit2 size={13} aria-hidden /> Connected
            </span>
            Bot installed on <strong className="text-ink">{status.installation.accountLogin}</strong>
            <span className="text-xs text-ink-mute">({status.installation.accountType})</span>
            <button type="button" disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-bad hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded disabled:opacity-60">
              <Unplug size={12} aria-hidden /> Disconnect
            </button>
          </p>

          {available && available.some((r) => !r.registered) && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="gh-repo-pick" className="form-label">Add a repository the bot can read</label>
                <select id="gh-repo-pick" value={pick} onChange={(e) => setPick(e.target.value)}
                  className="form-control mt-1.5" disabled={busy !== null}>
                  {available.filter((r) => !r.registered).map((r) => (
                    <option key={r.fullName} value={r.fullName}>{r.fullName} ({r.defaultBranch}){r.private ? " · private" : ""}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => void addRepo()} disabled={busy !== null || !pick} className="button-secondary">
                {busy === "add-repo" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <FolderGit2 size={15} aria-hidden />}
                Add repository
              </button>
            </div>
          )}
          {available && available.length > 0 && available.every((r) => r.registered) && (
            <p className="mt-3 text-xs text-ink-mute">Every repository the bot can read is registered. Extend its access from the GitHub App settings if you need more.</p>
          )}
          {available && available.length === 0 && (
            <p className="mt-3 text-xs text-ink-mute">The bot can&apos;t see any repositories yet — on GitHub, give the Clyvro App access to at least one repository, then reload this page.</p>
          )}

          {status.repos.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {status.repos.map((repo) => (
                <li key={repo.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="min-w-0 flex-1 truncate font-semibold" title={repo.fullName}>{repo.fullName}</span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{repo.defaultBranch}</span>
                    {repo.scanDue && (
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn">New commits — scan due</span>
                    )}
                    {repo.latestReview ? (
                      <span className="text-xs text-ink-soft">
                        score <strong className="text-ink">{repo.latestReview.score}/100</strong> ·{" "}
                        {repo.latestReview.counts.critical + repo.latestReview.counts.high} high+ ·{" "}
                        <LocalDateTime value={repo.latestReview.createdAt} />
                      </span>
                    ) : (
                      <span className="text-xs text-ink-mute">Never scanned</span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => void scan(repo)} className="button-primary !min-h-9 !px-3.5 !py-1.5 text-xs">
                      {busy === `scan-${repo.id}` ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
                      {busy === `scan-${repo.id}` ? "Reviewing repo…" : repo.latestReview ? "Re-run full-repo review" : "Run full-repo review"}
                    </button>
                    {repo.latestReview && (
                      <button type="button" disabled={busy !== null} onClick={() => void openDetail(repo.latestReview!.id)}
                        className="button-secondary !min-h-9 !px-3.5 !py-1.5 text-xs">
                        <ScanSearch size={13} aria-hidden /> View detailed scan
                      </button>
                    )}
                    {repo.lastScannedSha && (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-mute">
                        <RefreshCw size={11} aria-hidden /> at {repo.lastScannedSha.slice(0, 7)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-line bg-surface p-5 text-sm text-ink-soft">
              No repositories registered yet — add one above and run its first full-repo review.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => void disconnect()}
        title="Disconnect GitHub?"
        message="This removes the installation link, the registered repositories, and their saved reviews from this workspace. The bot itself stays installed on GitHub until you remove it there."
        confirmLabel="Disconnect"
        destructive
      />
    </section>
  );
}
