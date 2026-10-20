import Link from "next/link";
import { getSessionContext } from "@/lib/api";
import { listClients } from "@/lib/services/clients";
import { canWrite } from "@/lib/permissions";
import CreateClientForm from "@/components/app/CreateClientForm";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getSessionContext();
  const { q } = await searchParams;
  const summaries = await listClients(ctx.organizationId, q);
  const writable = canWrite(ctx.role);

  return (
    <div className="mt-8">
      <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Each client groups their websites, checks, and reports in one place.
      </p>

      <form method="get" className="mt-6 max-w-md" role="search">
        <label htmlFor="client-search" className="sr-only">Search clients</label>
        <input
          id="client-search" name="q" type="search" defaultValue={q ?? ""}
          placeholder="Search clients…"
          className="form-control"
        />
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {summaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center" role="status">
              <Building2 size={28} className="mx-auto text-ink-mute" aria-hidden />
              <p className="mt-3 font-semibold">{q ? "No clients match that search" : "No clients yet"}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {q ? "Try a different name." : writable ? "Add your first client on the right, then attach their websites." : "An admin or member can add clients."}
              </p>
            </div>
          ) : (
            summaries.map(({ client, projectCount, latestAudit }) => (
              <Link
                key={client.id}
                href={`/app/clients/${client.id}`}
                className="block rounded-2xl border border-line bg-surface p-6 transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
              >
                <p className="font-semibold">{client.name}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {projectCount} website{projectCount === 1 ? "" : "s"}
                  {client.contactName ? ` · ${client.contactName}` : ""}
                  {client.contactEmail ? ` · ${client.contactEmail}` : ""}
                </p>
                <p className="mt-2 text-xs text-ink-mute">
                  {latestAudit
                    ? `Last check ${latestAudit.createdAt.toLocaleDateString()} · ${latestAudit.status}${latestAudit.score !== null ? ` · score ${latestAudit.score}/100` : ""}`
                    : "No checks yet"}
                </p>
              </Link>
            ))
          )}
        </div>
        {writable && <CreateClientForm />}
      </div>
    </div>
  );
}
