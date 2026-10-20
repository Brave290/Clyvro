import { listAllChangelog } from "@/lib/services/changelog";
import { AdminChangelog } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminChangelogPage() {
  let entries: Awaited<ReturnType<typeof listAllChangelog>> = [];
  let loadError = false;
  try {
    entries = await listAllChangelog();
  } catch {
    loadError = true;
  }
  if (loadError) {
    return (
      <section aria-label="Changelog">
        <h2 className="text-lg font-bold">Changelog — What&apos;s new</h2>
        <p className="mt-2 text-sm text-ink-soft">
          The changelog table isn&apos;t available yet — database migrations may still be pending.
          Once they run, this page can publish entries to <span className="font-semibold text-ink">/changelog</span>.
        </p>
      </section>
    );
  }
  return <AdminChangelog entries={entries} />;
}
