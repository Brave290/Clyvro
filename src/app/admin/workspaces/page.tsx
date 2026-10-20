import { listAdminOrgs } from "@/lib/services/admin";
import { AdminOrgs } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminWorkspacesPage() {
  const orgs = await listAdminOrgs();
  return <AdminOrgs orgs={orgs} />;
}
