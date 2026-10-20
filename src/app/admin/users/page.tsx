import { listAdminUsers } from "@/lib/services/admin";
import { AdminUsers } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await listAdminUsers();
  return <AdminUsers users={users} />;
}
