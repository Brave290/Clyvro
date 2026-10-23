"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, Terminal } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import ExportBar from "@/components/ExportBar";
import { GithubBotPanel, type RepoReviewDetail } from "@/components/app/GithubBotPanel";
import { useToast } from "@/components/Toast";
import { codeReviewToAgentPrompt, codeReviewToMarkdown, type CodeLanguage, type CodeReviewReport } from "@/lib/code-review-shared";
import { repoReviewToAgentPrompt, repoReviewToMarkdown, type RepoReviewReport } from "@/lib/code-review-repo-shared";
import { thoroughToAgentPrompt, thoroughToMarkdown, type ThoroughReport } from "@/lib/code-review-thorough";
import { exportSlug } from "@/lib/check-export";

const LANGUAGES: { id: CodeLanguage; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
  { id: "other", label: "Other" },
];

interface HistoryRow {
  id: string;
  title: string;
  language: string;
  summary: { score?: number; critical?: number; high?: number; filesReviewed?: number; lines?: number };
  createdAt: string;
}

const SEV: Record<string, string> = {
  critical: "bg-bad-soft text-bad",
  high: "bg-warn-soft text-warn",
  medium: "bg-accent-soft text-accent",
  low: "bg-canvas text-ink-mute",
};

export default function CodeReviewerClient() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<CodeLanguage>("auto");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState<{ id: string; title: string; report: CodeReviewReport } | null>(null);
  const [github, setGithub] = useState<RepoReviewDetail | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/code-reviews").then((r) => r.json()).catch(() => null);
    if (res?.history) setHistory(res.history as HistoryRow[]);
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("github") === "connected") {
      toast("success", "GitHub connected", "Pick a repository below and run a thorough review.");
    }
  }, [toast]);

  async function submitPaste(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setGithub(null);
    try {
      const res = await fetch("/api/code-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, language, code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The review couldn't run.");
      setPaste({ id: json.id as string, title: title.trim() || "Untitled", report: json.report as CodeReviewReport });
      setCode("");
      toast("success", "Review ready", `Score ${json.report.score}/100. We'll email you the summary.`);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The review couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 pb-16">
      <header>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
          Code Reviewer
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          A thorough walk of a real tree — every path is inventoried (missing README, LICENSE, CI, tests, .gitignore, env names),
          then reviewable source is pattern-matched line by line. Not instant nits, not an AI, not a pentest.
          Source is analysed in memory and never stored. AI-on-evidence and live Vercel env compare come later.
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
clyvro login
clyvro review .`}</pre>
        <p className="mt-2 text-xs text-ink-mute">
          Not an Alpine package — <code className="font-mono">apk add clyvro</code> will not work. The install script puts <code className="font-mono">clyvro</code> on your PATH.
          A TTY shows live progress so you know it is working.
        </p>
      </section>

      <GithubBotPanel onOpenReview={(detail) => { setGithub(detail); setPaste(null); }} />

      <form onSubmit={(e) => void submitPaste(e)} className="form-panel mt-6 max-w-2xl space-y-4" aria-label="Paste a file">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Bot size={18} className="text-accent" aria-hidden /> Or paste one file
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Quick check of a single file. For a whole repo, use the CLI or the GitHub bot above.
        </p>
        <div>
          <label htmlFor="cr-title" className="form-label">Title</label>
          <input id="cr-title" className="form-control mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="auth.js" />
        </div>
        <div>
          <label htmlFor="cr-lang" className="form-label">Language</label>
          <select id="cr-lang" className="form-control mt-1.5" value={language} onChange={(e) => setLanguage(e.target.value as CodeLanguage)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cr-code" className="form-label">Code</label>
          <textarea id="cr-code" required minLength={10} rows={12} className="form-control mt-1.5 font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste source here. It is never stored." />
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button type="submit" disabled={busy} className="button-primary">
          {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null}
          {busy ? "Reviewing…" : "Review this file"}
        </button>
      </form>

      {paste && (
        <section className="form-panel mt-6 max-w-3xl space-y-4" aria-label="Paste review">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold">{paste.title}</h2>
            <span className="rounded-xl bg-canvas px-3 py-1 text-sm font-bold">{paste.report.score}/100</span>
            <span className="text-xs text-ink-mute">{paste.report.language} · {paste.report.lines} lines</span>
            <div className="ml-auto">
              <ExportBar content={{
                markdown: codeReviewToMarkdown(paste.title, paste.report),
                agentPrompt: codeReviewToAgentPrompt(paste.title, paste.report),
                json: JSON.stringify({ tool: "clyvro-code-review", report: paste.report }, null, 2),
                slug: exportSlug("code-review", paste.title),
              }} />
            </div>
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">{paste.report.note}</p>
          <FindingList findings={paste.report.findings} />
        </section>
      )}

      {github && (
        <RepoDetail detail={github} />
      )}

      {history.length > 0 && (
        <section className="mt-8 max-w-2xl" aria-label="Recent reviews">
          <h2 className="text-lg font-bold">Recent reviews</h2>
          <ul className="mt-3 space-y-2">
            {history.map((row) => (
              <li key={row.id} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-ink">{row.title}</strong>
                  <span className="text-xs text-ink-mute">{row.language}</span>
                  <span className="ml-auto text-xs font-bold">{row.summary.score ?? "—"}/100</span>
                </div>
                <p className="mt-1 text-xs text-ink-mute">
                  <LocalDateTime value={row.createdAt} />
                  {typeof row.summary.filesReviewed === "number" ? ` · ${row.summary.filesReviewed} files` : ""}
                  {typeof row.summary.lines === "number" ? ` · ${row.summary.lines} lines` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FindingList({ findings }: { findings: { ruleId: string; severity: string; title: string; evidence: string; recommendation: string; file?: string; line?: number }[] }) {
  if (!findings.length) {
    return (
      <p className="rounded-2xl border border-good/25 bg-good-soft p-5 text-sm text-good">
        No known-bad patterns matched.
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
