import Link from "next/link";
import { auth } from "@/auth";
import { listProjects } from "@/lib/services/audits";
import CreateProjectForm from "@/components/app/CreateProjectForm";
import { FolderOpen, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const projects = await listProjects(session!.user.organizationId!);

  return (
    <div className="mt-8">
      <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Each project is a website you audit over time. Audits are saved, comparable between runs,
        and shareable via revocable links.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center" role="status">
              <FolderOpen size={28} className="mx-auto text-ink-mute" aria-hidden />
              <p className="mt-3 font-semibold">No projects yet</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Create your first project on the right, then run its first audit.
                Or try the <Link href="/scan" className="font-semibold text-accent hover:underline">quick scan</Link> first.
              </p>
            </div>
          ) : (
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="block rounded-2xl border border-line bg-surface p-6 transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
              >
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-ink-soft">
                  <Globe size={14} className="shrink-0 text-ink-mute" aria-hidden /> {p.siteUrl}
                </p>
                <p className="mt-2 text-xs text-ink-mute">Created {p.createdAt.toLocaleDateString()}</p>
              </Link>
            ))
          )}
        </div>
        <CreateProjectForm />
      </div>
    </div>
  );
}
