import { listAdminLog } from "@/lib/services/admin";
import { AdminLog } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage() {
  const log = await listAdminLog();
  return <AdminLog log={log} />;
}
