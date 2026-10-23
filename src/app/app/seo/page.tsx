"use client";
import { useState } from "react";
import { ListOrdered, LoaderCircle, SearchCheck } from "lucide-react";
import CheckReport, { ReportSkeleton, SummaryPills, type CheckItem } from "@/components/app/CheckReport";
import { RemainingNote, UpgradePanel, useToolAccess } from "@/components/app/ToolGate";
import ExportBar from "@/components/ExportBar";
import { checkReportToAgentBrief, checkReportToMarkdown, exportSlug } from "@/lib/check-export";

interface SeoReport {
  domain: string;
  finalUrl: string | null;
  checks: CheckItem[];
  summary: { pass: number; warn: number; fail: number; total: number };
  preview: { title: string | null; url: string; description: string | null; logo: string | null; siteName: string | null };
  indexing: { state: string; why: string }[];
  visibilitySteps: string[];
}

/**
 * SEO Visibility (New): can search engines see and show this site?
 * Reads exactly what crawlers fetch, shows the likely search snippet,
 * and turns every gap into ordered fix steps. Actual rankings live in
 * Search Console — the report says so plainly instead of guessing.
 */
export default function SeoVisibilityPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SeoReport | null>(null);

  const { access, refresh } = useToolAccess("seo-visibility");
  const exhausted = access !== null && !access.allowed;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/seo-visibility", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The SEO check couldn't run.");
      setReport(json.report as SeoReport);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The SEO check couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          SEO Visibility
          <span className="rounded-full bg-good px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Find out whether Google and other search engines can actually find and display your site — and
          exactly what to do when they can&apos;t. We read the same signals crawlers read (index directives,
          robots.txt, sitemap, titles, canonicals, structured data), show the snippet searchers would see,
          and turn every gap into steps. Your real rankings and clicks live in Google Search Console; this
          report tells you how to check them instead of pretending to know.
        </p>
      </header>

      {exhausted && access ? <UpgradePanel access={access} /> : (<>
      <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="seo-url" className="form-label">Website to check <span className="text-bad" aria-hidden="true">*</span></label>
          <input id="seo-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" inputMode="url"
            className="form-control mt-1.5" disabled={busy} />
        </div>
        <button type="submit" disabled={busy} className="button-primary">
          {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <SearchCheck size={15} aria-hidden />}
          {busy ? "Checking…" : "Check visibility"}
        </button>
      </form>
      {error && <p role="alert" className="form-error mt-4">{error}</p>}
      <RemainingNote access={access} />
      </>)}
      {busy && <ReportSkeleton />}

      {report && !busy && (
        <section aria-label="SEO visibility report" className="mt-8 space-y-6">
          <h2 className="text-lg font-bold">{report.domain}</h2>
          <SummaryPills summary={report.summary} />
          <div className="flex justify-end">
            <ExportBar
              content={{
                markdown: checkReportToMarkdown("SEO Visibility", report.domain, report.checks, [`Search preview title: ${report.preview.title ?? "(none)"}`, `Search preview description: ${report.preview.description ?? "(none)"}`, ...report.visibilitySteps.map((s, i) => `Visibility step ${i + 1}: ${s}`)]),
                agentPrompt: checkReportToAgentBrief("a Clyvro SEO Visibility check", report.domain, report.checks, ["Rankings themselves can only be read in Google Search Console — never promise ranking changes."]),
                json: JSON.stringify({ tool: "clyvro-seo-visibility", exportedAt: new Date().toISOString(), report }, null, 2),
                slug: exportSlug("seo-visibility", report.domain),
              }}
            />
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-base font-bold">How you&apos;d appear in Google</h3>
            <p className="mt-1 text-sm text-ink-mute">Built from the logo, title and description crawlers actually fetched — the same ingredients Google starts from. Rankings themselves only live in Search Console.</p>
            <div className="mt-4 max-w-xl rounded-xl border border-line bg-white px-4 py-3 dark:bg-[#202124]">
              <div className="flex items-center gap-2.5">
                {report.preview.logo
                  ? <img src={report.preview.logo} alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-full object-cover bg-canvas" />
                  : <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-canvas text-[11px] font-bold text-ink-mute">{(report.preview.siteName ?? report.domain).slice(0, 1).toUpperCase()}</span>}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{report.preview.siteName ?? report.domain}</p>
                  <p className="truncate text-[12px] text-ink-mute">{report.preview.url}</p>
                </div>
              </div>
              <p className="mt-1.5 truncate text-[20px] font-medium leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{report.preview.title ?? "(no title — Google will invent one)"}</p>
              <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-ink-soft">{report.preview.description ?? "(no meta description — Google will quote a random paragraph)"}</p>
            </div>
          </div>

          {report.indexing?.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="text-base font-bold">Why this page may not be indexed</h3>
              <p className="mt-1 text-sm text-ink-mute">Statuses Google Search Console uses. We infer them from crawl signals — we cannot read your Search Console account.</p>
              <ul className="mt-3 space-y-2">
                {report.indexing.map((row) => (
                  <li key={row.state} className="rounded-xl bg-canvas px-3.5 py-2.5">
                    <p className="text-sm font-semibold">{row.state}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{row.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CheckReport checks={report.checks} />

          <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
            <h3 className="flex items-center gap-2 text-base font-bold"><ListOrdered size={16} className="text-accent" aria-hidden /> Get (more) visible — in this order</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-base leading-relaxed text-ink-soft">
              {report.visibilitySteps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}
