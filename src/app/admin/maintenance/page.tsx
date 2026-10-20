import { getMaintenance } from "@/lib/services/site";
import { AdminMaintenance } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  const maintenance = await getMaintenance(undefined, true);
  return <AdminMaintenance maintenance={maintenance} />;
}
