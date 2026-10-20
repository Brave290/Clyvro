"use client";
import { useState } from "react";
import { ListOrdered, LoaderCircle, SearchCheck } from "lucide-react";
import CheckReport, { ReportSkeleton, SummaryPills, type CheckItem } from "@/components/app/CheckReport";

interface SeoReport {
  domain: string;
  finalUrl: string | null;
  checks: CheckItem[];
  summary: { pass: number; warn: number; fail: number; total: number };
  preview: { title: string | null; url: string; description: string | null };
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
      {busy && <ReportSkeleton />}

      {report && !busy && (
        <section aria-label="SEO visibility report" className="mt-8 space-y-6">
          <h2 className="text-lg font-bold">{report.domain}</h2>
          <SummaryPills summary={report.summary} />

          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold">How you&apos;d appear in search results</h3>
            <p className="mt-1 text-xs text-ink-mute">Built from your real title and meta description — the same ingredients Google, Bing and DuckDuckGo start from.</p>
            <div className="mt-4 max-w-xl rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="truncate text-xs text-ink-mute">{report.preview.url}</p>
              <p className="mt-0.5 truncate text-base font-medium text-accent">{report.preview.title ?? "(no title — Google will invent one)"}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{report.preview.description ?? "(no meta description — Google will quote a random paragraph)"}</p>
            </div>
          </div>

          <CheckReport checks={report.checks} />

          <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ListOrdered size={16} className="text-accent" aria-hidden /> Get (more) visible — in this order</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
              {report.visibilitySteps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}
