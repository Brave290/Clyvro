import { listCustomerCronRuns, listDispatchRuns } from "@/lib/services/dispatch";
import { AdminCron } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminCronPage() {
  const [runs, customerRuns] = await Promise.all([listDispatchRuns(50), listCustomerCronRuns(30)]);
  return <AdminCron runs={runs} customerRuns={customerRuns} />;
}
