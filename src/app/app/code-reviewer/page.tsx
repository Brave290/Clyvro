"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronDown, FileCode2, LoaderCircle, ScanSearch } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import ExportBar from "@/components/ExportBar";
import { GithubBotPanel, type RepoReviewDetail } from "@/components/app/GithubBotPanel";
import { exportSlug } from "@/lib/check-export";
import {
  codeReviewToAgentPrompt,
  codeReviewToMarkdown,
  type CodeReviewReport,
} from "@/lib/code-review-shared";
import {
  repoReviewToAgentPrompt,
  repoReviewToMarkdown,
} from "@/lib/code-review-repo-shared";

interface HistoryRow {
  id: string; title: string; language: string;
  summary: { score: number; critical: number; high: number; medium: number; low: number; lines: number };
  createdAt: string;
}

const SEV_STYLE: Record<string, string> = {
  critical: "bg-bad-soft text-bad",
  high: "bg-bad-soft text-bad",
  medium: "bg-warn-soft text-warn",
  low: "bg-canvas text-ink-soft",
};

const SAMPLE = `// Try me — or paste your own file
const apiKey = "sk-live-9f27ab41c0d84e12";
app.get("/user", (req, res) => {
  const q = "SELECT * FROM users WHERE id = " + req.query.id;
  db.query(q);
  res.send("<div>" + req.query.name + "</div>");
  document.getElementById("x").innerHTML = location.hash;
});`;

/**
 * Code Reviewer: the GitHub bot is the product — install it, register
 * repos, run whole-repo reviews, and read the per-file detailed scan
 * here. The v1 paste checker stays as a quick one-file tool (code
 * analysed in memory, never stored — only findings are saved).
 */
export default function CodeReviewerPage() {
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("auto");
  const [code, setCode] = useState("");
  const [report, setReport] = useState<CodeReviewReport | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoDetail, setRepoDetail] = useState<RepoReviewDetail | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/code-reviews").then((r) => r.json()).catch(() => null);
    if (res?.history) setHistory(res.history as HistoryRow[]);
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/code-reviews", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, language, code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The review couldn't run.");
      setReport(json.report as CodeReviewReport);
      setReportTitle(title.trim() || `Untitled ${(json.report as CodeReviewReport).language} review`);
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The review couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    const res = await fetch(`/api/code-reviews/${id}`).then((r) => r.json()).catch(() => null);
    if (res?.review) {
      setReport(res.review.results as CodeReviewReport);
      setReportTitle(res.review.title as string);
    }
  }

  const repoReport = repoDetail?.report;

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Code Reviewer
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">GitHub bot</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Install the Clyvro bot on GitHub and it reviews <strong className="text-ink">every reviewable file in
          your repositories</strong> — hardcoded secrets, dynamic code execution, SQL built by string
          concatenation, unsafe deserialization, disabled TLS verification and more, each finding quoting the
          exact file and line plus the fix. <strong className="text-ink">Source is analysed in memory and never
          stored</strong>; only findings are saved. Honest scope: deterministic pattern matching, not an AI and
          not a penetration test.
        </p>
      </header>

      <GithubBotPanel onOpenReview={(detail) => {
        setRepoDetail(detail);
        document.getElementById("repo-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }} />

      {repoDetail && repoReport && (
        <section id="repo-detail" aria-label="Detailed repo scan" className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3" role="status">
            <h2 className="text-lg font-bold">Detailed scan — {repoDetail.fullName}</h2>
            <span className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold text-ink-soft">
              Score {repoReport.score}/100 · {repoReport.filesScanned} files · {repoReport.totalLines.toLocaleString()} lines ·{" "}
              {repoReport.counts.critical} critical · {repoReport.counts.high} high · {repoReport.counts.medium} medium · {repoReport.counts.low} low
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setRepoDetail(null)}
                className="text-xs font-semibold text-ink-mute hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded">
                Close detail
              </button>
              <ExportBar
                agentLabel="Copy fix brief for my agent"
                content={{
                  markdown: repoReviewToMarkdown(repoDetail.fullName, repoDetail.commitSha, repoReport),
                  agentPrompt: repoReviewToAgentPrompt(repoDetail.fullName, repoDetail.commitSha, repoReport),
                  json: JSON.stringify({ tool: "clyvro-repo-review", exportedAt: new Date().toISOString(), repo: repoDetail.fullName, commitSha: repoDetail.commitSha, report: repoReport }, null, 2),
                  slug: exportSlug("repo-review", repoDetail.fullName),
                }}
              />
            </div>
          </div>
          <p className="text-xs text-ink-mute">
            Reviewed <LocalDateTime value={repoDetail.createdAt} />
            {repoDetail.commitSha && <> · commit <span className="font-mono">{repoDetail.commitSha.slice(0, 7)}</span></>}
            {repoReport.filesSkipped > 0 && <> · {repoReport.filesSkipped} file(s) skipped (vendor folders, lockfiles, binaries, or over the size caps)</>}
            {repoReport.truncated && <> · findings capped at 300 — fix the worst files and re-run to see the rest</>}
          </p>
          <p className="rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-soft">{repoReport.note}</p>

          {repoReport.findings.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-soft">
              No known-bad patterns matched in the {repoReport.filesScanned} reviewed files. That&apos;s a good
              sign — not a guarantee (see the note above).
            </p>
          ) : (
            repoReport.files.filter((f) => f.findings > 0).map((file) => (
              <div key={file.path}>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  <FileCode2 size={15} className="text-accent" aria-hidden />
                  <span className="break-all">{file.path}</span>
                  <span className="text-xs font-medium text-ink-mute">{file.language} · {file.lines} lines · {file.findings} finding{file.findings === 1 ? "" : "s"}</span>
                </h3>
                <ul className="mt-2.5 space-y-3">
                  {repoReport.findings.filter((f) => f.file === file.path).map((f, i) => (
                    <li key={`${f.ruleId}-${f.line}-${i}`} className="rounded-2xl border border-line bg-surface p-4">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEV_STYLE[f.severity]}`}>{f.severity}</span>
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">{f.ruleId}</span>
                        {f.title}
                        <span className="text-xs font-medium text-ink-mute">({f.confidenceBasis})</span>
                      </p>
                      <p className="mt-2 break-all rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-ink-soft">{f.evidence}</p>
                      <p className="mt-2 text-xs leading-relaxed text-ink-soft"><strong className="text-ink">Fix:</strong> {f.recommendation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {repoReport.files.length > 0 && (
            <details className="rounded-2xl border border-line bg-surface px-4 py-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded">
                <ChevronDown size={14} aria-hidden /> All {repoReport.files.length} reviewed files
              </summary>
              <ul className="mt-3 space-y-1 text-xs text-ink-soft">
                {repoReport.files.map((f) => (
                  <li key={f.path} className="flex flex-wrap gap-x-3">
                    <span className="min-w-0 flex-1 break-all font-mono">{f.path}</span>
                    <span>{f.language}</span>
                    <span>{f.lines} lines</span>
                    <span>{f.findings} finding{f.findings === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section aria-label="Quick paste check" className="mt-12">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ScanSearch size={17} className="text-accent" aria-hidden /> Quick paste check
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          No GitHub handy? Paste a single file and get the same line-by-line review instantly. Your code is
          analysed in memory and never stored; only the findings join your history.
        </p>

        <form onSubmit={run} aria-busy={busy} className="form-panel mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="cr-title" className="form-label">Title (optional)</label>
              <input id="cr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. routes/user.js"
                className="form-control mt-1.5" disabled={busy} maxLength={120} />
            </div>
            <div>
              <label htmlFor="cr-lang" className="form-label">Language</label>
              <select id="cr-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="form-control mt-1.5" disabled={busy}>
                <option value="auto">Auto-detect</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="php">PHP</option>
                <option value="go">Go</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="cr-code" className="form-label">Code to review <span className="text-bad" aria-hidden="true">*</span></label>
            <textarea id="cr-code" required value={code} onChange={(e) => setCode(e.target.value)} rows={12}
              placeholder="Paste a source file here…" spellCheck={false}
              className="form-control mt-1.5 font-mono text-xs leading-relaxed" disabled={busy} />
            <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
              <span>{code.length.toLocaleString()} / 200,000 characters</span>
              <button type="button" onClick={() => { setCode(SAMPLE); setTitle("demo (try me)"); }} disabled={busy}
                className="font-semibold text-accent hover:underline">Load a demo snippet</button>
            </p>
          </div>
          <button type="submit" disabled={busy} className="button-primary">
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Bot size={15} aria-hidden />}
            {busy ? "Reviewing…" : "Review this code"}
          </button>
        </form>
        {error && <p role="alert" className="form-error mt-4">{error}</p>}

        {report && (
          <section aria-label="Code review result" className="mt-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3" role="status">
              <h2 className="text-lg font-bold">{reportTitle}</h2>
              <span className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold text-ink-soft">
                Score {report.score}/100 · {report.language} · {report.lines} lines ·{" "}
                {report.counts.critical} critical · {report.counts.high} high · {report.counts.medium} medium · {report.counts.low} low
              </span>
              <div className="ml-auto">
                <ExportBar
                  agentLabel="Copy fix brief for my agent"
                  content={{
                    markdown: codeReviewToMarkdown(reportTitle, report),
                    agentPrompt: codeReviewToAgentPrompt(reportTitle, report),
                    json: JSON.stringify({ tool: "clyvro-code-review", exportedAt: new Date().toISOString(), title: reportTitle, report }, null, 2),
                    slug: exportSlug("code-review", reportTitle),
                  }}
                />
              </div>
            </div>
            <p className="rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-soft">{report.note}</p>
            {report.findings.length === 0 ? (
              <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-soft">
                No known-bad patterns matched in this code. That&apos;s a good sign — not a guarantee (see the note above).
              </p>
            ) : (
              <ul className="space-y-3">
                {report.findings.map((f) => (
                  <li key={`${f.ruleId}-${f.line}`} className="rounded-2xl border border-line bg-surface p-4">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEV_STYLE[f.severity]}`}>{f.severity}</span>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">{f.ruleId}</span>
                      {f.title}
                      <span className="text-xs font-medium text-ink-mute">({f.confidenceBasis})</span>
                    </p>
                    <p className="mt-2 break-all rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-ink-soft">{f.evidence}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-soft"><strong className="text-ink">Fix:</strong> {f.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {history.length > 0 && (
          <section aria-label="Previous code reviews" className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-bold"><ScanSearch size={17} className="text-accent" aria-hidden /> Previous paste reviews</h2>
            <ul className="mt-4 space-y-2">
              {history.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => void openHistory(row.id)}
                    className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
                    <span className="flex-1 truncate font-semibold" title={row.title}>{row.title}</span>
                    <span className="text-xs text-ink-soft">{row.language} · score {row.summary.score}/100 · {row.summary.high + row.summary.critical} high+</span>
                    <span className="text-xs text-ink-mute"><LocalDateTime value={row.createdAt} /></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </div>
  );
}
