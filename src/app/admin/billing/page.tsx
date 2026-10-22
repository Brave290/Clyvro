import { getDb } from "@/lib/db";
import { hydratePlanCatalog } from "@/lib/services/plan-catalog";
import { AdminBilling } from "@/components/app/AdminBilling";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  const db = await getDb();
  const catalog = await hydratePlanCatalog(db);
  return <AdminBilling catalog={catalog} />;
}
