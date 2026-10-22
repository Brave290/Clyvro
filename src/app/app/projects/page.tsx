import Link from "next/link";
import { getSessionContext } from "@/lib/api";
import { listProjects } from "@/lib/services/audits";
import { listClients } from "@/lib/services/clients";
import { canWrite } from "@/lib/permissions";
import CreateProjectForm from "@/components/app/CreateProjectForm";
import { FolderOpen, Globe } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

/**
 * Website list. `/app/projects` used to 404 (only `/app/projects/[id]`
 * existed) while `/app/clients` and other /app siblings required sign-in.
 * This page sits in the same layout, so anonymous visitors are sent to
 * sign-in and signed-in users get their saved websites.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getSessionContext();
  const { q } = await searchParams;
  const needle = (q ?? "").trim().toLowerCase();
  const [allProjects, clientSummaries] = await Promise.all([
    listProjects(ctx.organizationId),
    listClients(ctx.organizationId),
  ]);
  const clientNameById = new Map(clientSummaries.map((s) => [s.client.id, s.client.name]));
  const projects = needle
    ? allProjects.filter((p) => {
      const client = p.clientId ? clientNameById.get(p.clientId) ?? "" : "";
      return p.name.toLowerCase().includes(needle) || p.siteUrl.toLowerCase().includes(needle) || client.toLowerCase().includes(needle);
    })
    : allProjects;
  const writable = canWrite(ctx.role);

  return (
    <div className="mt-8">
      <h1 className="text-3xl font-bold tracking-tight">Websites</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Every saved site in this workspace. Open one to run a check or read past reports.
      </p>

      <form method="get" className="mt-6 max-w-md" role="search">
        <label htmlFor="project-search" className="sr-only">Search websites</label>
        <input
          id="project-search" name="q" type="search" defaultValue={q ?? ""}
          placeholder="Search websites…"
          className="form-control"
        />
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center" role="status">
              <FolderOpen size={28} className="mx-auto text-ink-mute" aria-hidden />
              <p className="mt-3 font-semibold">{needle ? "No websites match that search" : "No websites yet"}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {needle
                  ? "Try a different name or URL."
                  : writable
                    ? "Add your first website on the right, then run a check."
                    : "An admin or member can add websites."}
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
                  {p.clientId ? `Client: ${clientNameById.get(p.clientId) ?? "—"} · ` : ""}
                  Added <LocalDateTime value={p.createdAt.toISOString()} format="date" />
                </p>
              </Link>
            ))
          )}
        </div>
        {writable ? <CreateProjectForm /> : (
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-soft" role="status">
            You have read-only access in this workspace. Ask an admin if you need to add websites.
          </p>
        )}
      </div>
    </div>
  );
}
