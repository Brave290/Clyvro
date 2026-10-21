import Link from "next/link";
import type { Metadata } from "next";
import { detailToScanReport, getSharedAudit } from "@/lib/services/audits";
import { getAppliedBranding } from "@/lib/services/orgs";
import ReportView from "@/components/ReportView";
import { CheckCircle2, ListChecks, ShieldAlert } from "lucide-react";
import type { Severity } from "@/lib/types";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const fallback: Metadata = {
    title: "Website check report | Clyvro",
    description: "A read-only website check report shared by link.",
    robots: { index: false, follow: false },
  };
  try {
    const detail = await getSharedAudit(token);
    if (!detail) return fallback;
    const report = detailToScanReport(detail);
    const host = (() => { try { return new URL(report.finalUrl ?? report.target).hostname; } catch { return report.target; } })();
    const description = report.score !== null
      ? `${host} scored ${report.score}/100 in a Clyvro evidence-first website check — ${report.findings.length} finding(s) with rule IDs, observed evidence and fixes. Read the shared report.`
      : `A Clyvro evidence-first website check of ${host}, shared by link.`;
    return {
      ...fallback,
      title: `Website check — ${host}${report.score !== null ? ` (${report.score}/100)` : ""} | Clyvro`,
      description,
      openGraph: { title: `Website check — ${host}`, description, type: "article" },
      twitter: { card: "summary", title: `Website check — ${host}`, description },
    };
  } catch {
    return fallback;
  }
}

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_WORD: Record<Severity, string> = {
  critical: "Needs fixing first",
  high: "Important",
  medium: "Worth fixing",
  low: "Minor",
};

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const detail = await getSharedAudit(token);

  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="rounded-2xl border border-warn/30 bg-warn-soft p-8 text-center" role="alert">
          <ShieldAlert size={28} className="mx-auto text-warn" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">This report link isn&apos;t available</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            The link may have expired or been cancelled by the person who sent it.
            Ask them to create a fresh link.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/scan" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Check your own website free →</Link>
          </p>
        </div>
      </div>
    );
  }

  const report = detailToScanReport(detail);
  const branding = await getAppliedBranding(detail.audit.organizationId).catch(() => null);
  const accent = branding?.color ?? "#2563EB";

  const statusByKey = new Map(detail.findings.map((f) => [f.findingKey, f.status]));
  const isOpen = (f: (typeof report.findings)[number]) =>
    statusByKey.get(`${f.ruleId}|${f.page}|${f.title}`) !== "dismissed";
  const openFindings = report.findings.filter(isOpen);
  const topFixes = [...openFindings]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, 3);
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {/* Agency band (branding applies on white-label plans) */}
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="px-6 py-5 sm:px-8" style={{ backgroundColor: accent }}>
          <p className="text-xl font-bold text-white">{branding?.name ?? "Website check"}</p>
          <p className="mt-0.5 text-sm font-medium text-white/85">
            Website check report · <LocalDateTime value={report.startedAt} format="date" />
            {branding?.viaClyvro ? " · prepared via Clyvro" : ""}
          </p>
        </div>
        <div className="px-6 py-5 sm:px-8">
          <h1 className="text-xl font-bold">In plain words</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            We visited <strong className="text-ink">{report.pages.length} page{report.pages.length === 1 ? "" : "s"}</strong> on
            this website and checked {report.coverage.linksChecked} links and{" "}
            {report.coverage.formDestinationsChecked} form destinations.
            {report.score !== null && (
              <> The site scored <strong className="text-ink">{report.score} out of 100</strong> — we start at 100 and take
              points off for each problem found, so a lower score simply means more (or more serious) things to fix.
              It&apos;s a to-do list ranking, not a sales or traffic prediction.</>
            )}
            {report.status === "partial" && (
              <> This check ran out of time before finishing everything, so treat it as a strong sample, not the full picture.</>
            )}
          </p>

          {topFixes.length > 0 ? (
            <>
              <h2 className="mt-5 flex items-center gap-2 font-semibold">
                <ListChecks size={17} style={{ color: accent }} aria-hidden /> Fix these first
              </h2>
              <ol className="mt-3 space-y-3">
                {topFixes.map((f) => (
                  <li key={`${f.ruleId}|${f.page}|${f.title}`} className="rounded-xl bg-canvas px-4 py-3">
                    <p className="text-sm font-semibold">
                      {f.title}{" "}
                      <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{SEV_WORD[f.severity]}</span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.recommendation}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-sm text-ink-soft">
                {openFindings.length} thing{openFindings.length === 1 ? "" : "s"} to look at in total — the full list with
                evidence is below.
              </p>
            </>
          ) : (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-good-soft px-4 py-3 text-sm" role="status">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-good" aria-hidden />
              Nothing to fix from this check — within what we could see, everything we tested is in place.
              The details (and what a check like this can&apos;t see) are below.
            </p>
          )}
          {branding?.footer && (
            <p className="mt-5 border-t border-line pt-3 text-sm font-medium text-ink-soft">{branding.footer}</p>
          )}
        </div>
      </div>

      <ReportView report={report} contextNote="shared report" />

      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Show this score on your website</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-mute">
          Paste this snippet where you want the live badge (it reflects this report and stops working if the link is revoked):
        </p>
        <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-lg bg-canvas px-3 py-2 font-mono text-[11px] text-ink-soft">
          {`<a href="https://clyvro.vercel.app/shared/${token}"><img src="https://clyvro.vercel.app/api/badge/${token}" alt="Scanned by Clyvro" width="196" height="28"></a>`}
        </code>
      </div>

      <p className="mt-8 text-center text-sm text-ink-soft">
        Want a check like this for your own site?{" "}
        <Link href="/scan" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Run a free scan</Link>{" "}
        or <Link href="/sign-up" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">create a free account</Link>.
      </p>
    </div>
  );
}
