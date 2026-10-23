"use client";

import { useEffect, useState } from "react";
import { Terminal } from "lucide-react";
import ExportBar from "@/components/ExportBar";
import { GithubBotPanel, type RepoReviewDetail } from "@/components/app/GithubBotPanel";
import { useToast } from "@/components/Toast";
import { repoReviewToAgentPrompt, repoReviewToMarkdown, type RepoReviewReport } from "@/lib/code-review-repo-shared";
import { thoroughToAgentPrompt, thoroughToMarkdown, type ThoroughReport } from "@/lib/code-review-thorough";
import { exportSlug } from "@/lib/check-export";

const SEV: Record<string, string> = {
  critical: "bg-bad-soft text-bad",
  high: "bg-warn-soft text-warn",
  medium: "bg-accent-soft text-accent",
  low: "bg-canvas text-ink-mute",
};

export default function CodeReviewerClient() {
  const { toast } = useToast();
  const [github, setGithub] = useState<RepoReviewDetail | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("github") === "connected") {
      toast("success", "GitHub connected", "Pick a repository below and run a thorough review.");
    }
  }, [toast]);

  return (
    <div className="mt-8 pb-16">
      <header>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
          Code Reviewer
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Reads every line, detects the language, finds bugs, and tells you what to fix — with the exact file, line, and change.
          Also flags missing README, LICENSE, CI, tests, .gitignore, and env names vs .env.example.
          Source is analysed in memory and never stored. Review a whole repo from the CLI or the GitHub bot.
        </p>
      </header>

      <section className="form-panel mt-6 max-w-2xl" aria-label="CLI">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Terminal size={18} className="text-accent" aria-hidden /> From a terminal or an agent
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The long walk belongs on your machine (or MCP workspace). It writes <code className="font-mono text-ink">REVIEW.md</code> next to the code.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed text-ink">{`curl -fsSL https://clyvro.vercel.app/install.sh | sh
clyvro help
clyvro login
clyvro review .`}</pre>
        <p className="mt-2 text-xs text-ink-mute">
          Alpine, Arch, Debian, macOS, Windows, WSL — see <a href="/developers#cli" className="font-semibold text-accent hover:underline">install for your OS</a>.
          Type <code className="font-mono">clyvro help</code> for every command.
        </p>
      </section>

      <GithubBotPanel onOpenReview={(detail) => { setGithub(detail); }} />

      {github && (
        <RepoDetail detail={github} />
      )}
    </div>
  );
}

function FindingList({ findings }: { findings: { ruleId: string; severity: string; title: string; evidence: string; recommendation: string; file?: string; line?: number }[] }) {
  if (!findings.length) {
    return (
      <p className="rounded-2xl border border-good/25 bg-good-soft p-5 text-sm text-good">
        No bugs matched.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {findings.map((f, i) => (
        <li key={`${f.ruleId}-${f.file ?? ""}-${f.line ?? i}`} className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEV[f.severity] ?? SEV.low}`}>{f.severity}</span>
            {f.ruleId} · {f.title}
          </h3>
          {f.file && <p className="mt-1 font-mono text-xs text-ink-mute">{f.file}{f.line ? `:${f.line}` : ""}</p>}
          <p className="mt-2 break-words rounded-lg bg-canvas px-3 py-2 font-mono text-xs leading-relaxed">{f.evidence}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft"><strong className="text-ink">Fix:</strong> {f.recommendation}</p>
        </li>
      ))}
    </ul>
  );
}

function RepoDetail({ detail }: { detail: RepoReviewDetail }) {
  const report = detail.report as RepoReviewReport & Partial<ThoroughReport>;
  return (
    <section className="form-panel mt-6 max-w-3xl space-y-4" aria-label="Repo review">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{detail.fullName}</h2>
        <span className="rounded-xl bg-canvas px-3 py-1 text-sm font-bold">{report.score}/100</span>
        <span className="text-xs text-ink-mute">{report.filesScanned} files · {report.totalLines} lines</span>
        <div className="ml-auto">
          <ExportBar content={{
            markdown: report.missing ? thoroughToMarkdown({
              rootName: detail.fullName,
              filesSeen: report.filesScanned,
              filesReviewed: report.filesScanned,
              filesSkipped: report.filesSkipped,
              totalLines: report.totalLines,
              truncated: report.truncated,
              score: report.score,
              findings: report.findings,
              counts: report.counts,
              missing: report.missing ?? [],
              env: report.env ?? { used: [], exampleKeys: [], missingFromExample: [] },
              vercel: report.vercel ?? { present: false, note: "" },
              note: report.note,
            }) : repoReviewToMarkdown(detail.fullName, detail.commitSha, report),
            agentPrompt: report.missing ? thoroughToAgentPrompt({
              rootName: detail.fullName,
              filesSeen: report.filesScanned,
              filesReviewed: report.filesScanned,
              filesSkipped: report.filesSkipped,
              totalLines: report.totalLines,
              truncated: report.truncated,
              score: report.score,
              findings: report.findings,
              counts: report.counts,
              missing: report.missing ?? [],
              env: report.env ?? { used: [], exampleKeys: [], missingFromExample: [] },
              vercel: report.vercel ?? { present: false, note: "" },
              note: report.note,
            }) : repoReviewToAgentPrompt(detail.fullName, detail.commitSha, report),
            json: JSON.stringify({ tool: "clyvro-code-review", repo: detail.fullName, report }, null, 2),
            slug: exportSlug("code-review", detail.fullName),
          }} />
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">{report.note}</p>
      {!!report.missing?.length && (
        <div>
          <h3 className="text-sm font-bold">Missing files</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            {report.missing.map((m) => (
              <li key={m.path}><strong className="text-ink">{m.path}</strong> ({m.severity}) — {m.why}</li>
            ))}
          </ul>
        </div>
      )}
      {!!report.env?.missingFromExample?.length && (
        <p className="text-sm text-ink-soft">
          Env names used in code but missing from .env.example:{" "}
          <span className="font-mono text-ink">{report.env.missingFromExample.join(", ")}</span>
        </p>
      )}
      {report.vercel?.note && <p className="text-xs text-ink-mute">{report.vercel.note}</p>}
      <FindingList findings={report.findings} />
    </section>
  );
}
