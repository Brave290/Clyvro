import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { getSessionContext } from "@/lib/api";
import { getDb } from "@/lib/db";
import { shareTokens } from "@/lib/db/schema";
import { listProjects } from "@/lib/services/audits";
import { listClients, portfolioOverview } from "@/lib/services/clients";
import { canWrite } from "@/lib/permissions";
import OnboardingChecklist from "@/components/app/OnboardingChecklist";
import UsageChart from "@/components/app/UsageChart";
import RescanButton from "@/components/app/RescanButton";
import { AlertTriangle, Building2, FolderOpen, Globe, History, Radar } from "lucide-react";
import { dashboardScanUsage } from "@/lib/services/audits";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  const orgId = ctx.organizationId;
  const [projects, portfolio, clientSummaries, db, usage] = await Promise.all([
    listProjects(orgId),
    portfolioOverview(orgId),
    listClients(orgId),
    getDb(),
    dashboardScanUsage(orgId),
  ]);
  const [{ value: shareCount }] = await db
    .select({ value: count() })
    .from(shareTokens)
    .where(eq(shareTokens.organizationId, orgId));

  const clientNameById = new Map(clientSummaries.map((s) => [s.client.id, s.client.name]));
  const writable = canWrite(ctx.role);

  const steps = [
    { label: "Add your first client", hint: "group each customer's websites together", done: portfolio.clientCount > 0, href: "/app/clients", cta: "Add a client" },
    { label: "Add a website to check", hint: "yours or a client's", done: portfolio.projectCount > 0, href: "/app/clients", cta: "Add a website" },
    { label: "Run your first check", hint: "we read the site and list what needs fixing", done: portfolio.auditsLast30d > 0 || portfolio.recentAudits.length > 0, href: "/app/scan", cta: "Run a check" },
    { label: "Share a report", hint: "send your client a clean, read-only link", done: shareCount > 0, href: portfolio.recentAudits[0] ? `/app/audits/${portfolio.recentAudits[0].id}` : "/app/scan", cta: "Open a report" },
  ];

  return (
    <div className="mt-8 space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight">Overview</h1><span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">Beta</span></div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Your clients, their websites, and what needs attention — all from your real saved checks.
        </p>
      </div>

      <OnboardingChecklist steps={steps} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Building2 size={18} className="text-accent" aria-hidden />} label="Clients" value={portfolio.clientCount} href="/app/clients" />
        <Stat icon={<Globe size={18} className="text-accent" aria-hidden />} label="Websites" value={portfolio.projectCount} href="#websites" />
        <Stat icon={<Radar size={18} className="text-accent" aria-hidden />} label="Checks (30 days)" value={portfolio.auditsLast30d} href="#recent" />
        <Stat icon={<AlertTriangle size={18} className="text-warn" aria-hidden />} label="Serious issues open" value={portfolio.openCriticalHigh} href="#recent" />
      </div>

      <UsageChart used={usage.used} limit={usage.limit} events={usage.events} />

      {(portfolio.failedLast30d > 0 || portfolio.staleClients.length > 0) && (
        <section className="rounded-2xl border border-line bg-surface p-6" aria-label="Needs attention">
          <h2 className="font-semibold">Worth a look</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
            {portfolio.failedLast30d > 0 && (
              <li>{portfolio.failedLast30d} check{portfolio.failedLast30d === 1 ? "" : "s"} couldn&apos;t finish in the last 30 days — open the website below and try again.</li>
            )}
            {portfolio.staleClients.map((c) => (
              <li key={c.id}>
                <Link href={`/app/clients/${c.id}`} className="font-semibold text-accent hover:underline">{c.name}</Link>{" "}
                {c.lastCompletedAt
                  ? <>was last checked on <LocalDateTime value={c.lastCompletedAt.toISOString()} format="date" />.</>
                  : "hasn't had a completed check yet."}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="recent" aria-label="Recent checks">
        <h2 className="flex items-center gap-2 font-semibold"><History size={17} className="text-accent" aria-hidden /> Recent checks</h2>
        {portfolio.recentAudits.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-mute" role="status">
            No checks yet. Run one from <Link href="/app/scan" className="font-semibold text-accent hover:underline">Scan</Link>.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {portfolio.recentAudits.map((a) => (
              <li key={a.id} className="flex items-center gap-1 rounded-2xl border border-line bg-surface pr-2 transition hover:border-accent/50 hover:shadow-sm">
                <Link href={`/app/audits/${a.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-5 py-4">
                  <span className="font-semibold">{a.projectName}</span>
                  {a.clientName && <span className="text-xs text-ink-mute">for {a.clientName}</span>}
                  <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold capitalize">{a.status}</span>
                  {a.score !== null && <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold">Score {a.score}/100</span>}
                  <LocalDateTime value={a.createdAt.toISOString()} className="ml-auto text-xs text-ink-mute" />
                </Link>
                {writable && <RescanButton url={a.targetUrl} mode={a.scanMode} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="websites" aria-label="Websites">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Websites</h2>
          {writable && (
            <Link href="/app/clients" className="text-xs font-semibold text-accent hover:underline">Manage on Clients</Link>
          )}
        </div>
        <div className="mt-4 space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center" role="status">
              <FolderOpen size={28} className="mx-auto text-ink-mute" aria-hidden />
              <p className="mt-3 font-semibold">No websites yet</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Add websites under <Link href="/app/clients" className="font-semibold text-accent hover:underline">Clients</Link>.
                Or run a <Link href="/app/scan" className="font-semibold text-accent hover:underline">quick scan</Link> first.
              </p>
            </div>
          ) : (
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="block rounded-2xl border border-line bg-surface p-6 transition duration-200 hover:border-accent/50 hover:shadow-md"
              >
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-ink-soft">
                  <Globe size={14} className="shrink-0 text-ink-mute" aria-hidden /> {p.siteUrl}
                </p>
                <p className="mt-2 text-xs text-ink-mute">
                  {p.clientId ? `Client: ${clientNameById.get(p.clientId) ?? "—"} · ` : ""}Added <LocalDateTime value={p.createdAt.toISOString()} format="date" />
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-line bg-surface p-5 transition hover:border-accent/50 hover:shadow-sm">
      <p className="flex items-center gap-2 text-xs font-medium text-ink-mute">{icon} {label}</p>
      <p className="mt-1.5 text-3xl font-bold">{value}</p>
    </Link>
  );
}
