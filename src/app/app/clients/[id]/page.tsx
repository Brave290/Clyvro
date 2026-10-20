import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getSessionContext } from "@/lib/api";
import { getDb } from "@/lib/db";
import { audits, projects } from "@/lib/db/schema";
import { getClient } from "@/lib/services/clients";
import { canWrite } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";
import EditClientForm from "@/components/app/EditClientForm";
import { Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  const { id } = await params;

  let client;
  try {
    client = await getClient(ctx.organizationId, id);
  } catch (err) {
    if (err instanceof ScanError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const db = await getDb();
  const clientProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, ctx.organizationId), eq(projects.clientId, id), isNull(projects.archivedAt)))
    .orderBy(desc(projects.createdAt));

  const recentAudits = clientProjects.length
    ? await db
        .select({ id: audits.id, projectId: audits.projectId, score: audits.score, status: audits.status, createdAt: audits.createdAt })
        .from(audits)
        .where(and(eq(audits.organizationId, ctx.organizationId), inArray(audits.projectId, clientProjects.map((p) => p.id))))
        .orderBy(desc(audits.createdAt))
        .limit(8)
    : [];
  const projectName = new Map(clientProjects.map((p) => [p.id, p.name]));
  const writable = canWrite(ctx.role);

  return (
    <div className="mt-8">
      <Link href="/app/clients" className="text-sm font-semibold text-accent hover:underline">← All clients</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{client.name}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        {[client.contactName, client.contactEmail].filter(Boolean).join(" · ") || "No contact details yet"}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section aria-label="Client websites">
            <h2 className="font-semibold">Websites</h2>
            {clientProjects.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-mute" role="status">
                No websites under this client yet. Add one from the{" "}
                <Link href="/app#new-project" className="font-semibold text-accent hover:underline">Overview</Link>{" "}
                and pick this client, or assign an existing website from its page.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {clientProjects.map((p) => (
                  <Link key={p.id} href={`/app/projects/${p.id}`}
                    className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-accent/50 hover:shadow-sm">
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-ink-soft">
                      <Globe size={14} className="shrink-0 text-ink-mute" aria-hidden /> {p.siteUrl}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Recent checks">
            <h2 className="font-semibold">Recent checks</h2>
            {recentAudits.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-mute" role="status">
                No checks for this client yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {recentAudits.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/audits/${a.id}`} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-4 transition hover:border-accent/50 hover:shadow-sm">
                      <span className="font-semibold">{projectName.get(a.projectId) ?? "Website"}</span>
                      <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold capitalize">{a.status}</span>
                      {a.score !== null && <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold">Score {a.score}/100</span>}
                      <span className="ml-auto text-xs text-ink-mute">{a.createdAt.toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        {writable && <EditClientForm client={client} />}
      </div>
    </div>
  );
}
