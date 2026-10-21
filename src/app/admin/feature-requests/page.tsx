import { auth } from "@/auth";
import {
  listFeatureRequestsForAdmin,
  topRequestedThisMonth,
  type AdminFeatureRequestView,
} from "@/lib/services/feature-requests";
import AdminFeatureRequests from "@/components/app/AdminFeatureRequests";

export const dynamic = "force-dynamic";

export default async function AdminFeatureRequestsPage() {
  const session = await auth();
  let rows: AdminFeatureRequestView[] = [];
  let hot: { id: string; title: string; votes: number }[] = [];
  let loadError = false;
  try {
    rows = await listFeatureRequestsForAdmin(session?.user?.id ?? "");
    hot = await topRequestedThisMonth().catch(() => []);
  } catch {
    loadError = true;
  }
  if (loadError) {
    return (
      <section aria-label="Feature requests">
        <h2 className="text-lg font-bold">Feature requests</h2>
        <p className="mt-2 text-sm text-ink-soft">
          The feature-request tables aren&apos;t available yet — database migrations may still be pending.
          Once they run, community requests and their upvotes appear here.
        </p>
      </section>
    );
  }
  return <AdminFeatureRequests initial={rows} hot={hot} />;
}
