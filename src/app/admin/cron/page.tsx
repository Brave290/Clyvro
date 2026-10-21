import { listCustomerCronRuns, listDispatchRuns } from "@/lib/services/dispatch";
import { AdminCron } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminCronPage() {
  const [runs, customerRuns] = await Promise.all([listDispatchRuns(50), listCustomerCronRuns(30)]);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "");
  // Presence only — the value never leaves the server.
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET?.trim());
  return <AdminCron runs={runs} customerRuns={customerRuns} siteUrl={siteUrl} cronSecretConfigured={cronSecretConfigured} />;
}
