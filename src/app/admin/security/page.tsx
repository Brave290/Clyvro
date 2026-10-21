import { headers } from "next/headers";
import { getShieldOverview, ipKey } from "@/lib/services/shield";
import { maskIp, requestIp } from "@/lib/shield/rules";
import { AdminSecurity } from "@/components/app/AdminSecurity";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const ip = requestIp(await headers());
  const [overview, myHash] = await Promise.all([getShieldOverview(), ipKey(ip)]);
  return (
    <AdminSecurity
      overview={overview}
      me={{ masked: maskIp(ip), hash: myHash, allowlisted: overview.settings.allow.some((a) => a.hash === myHash) }}
    />
  );
}
