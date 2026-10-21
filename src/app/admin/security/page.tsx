import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { getShieldOverview, ipKey } from "@/lib/services/shield";
import { inspectTrustCookie, TRUST_COOKIE } from "@/lib/services/trust";
import { maskIp, requestIp } from "@/lib/shield/rules";
import { AdminSecurity } from "@/components/app/AdminSecurity";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const [hdrs, jar, session] = await Promise.all([headers(), cookies(), auth()]);
  const ip = requestIp(hdrs);
  const [overview, myHash] = await Promise.all([getShieldOverview(), ipKey(ip)]);
  const trust = session?.user?.id ? await inspectTrustCookie(jar.get(TRUST_COOKIE)?.value, session.user.id) : null;
  return (
    <AdminSecurity
      overview={overview}
      me={{
        masked: maskIp(ip),
        hash: myHash,
        allowlisted: overview.settings.allow.some((a) => a.hash === myHash),
        trustedUntil: trust ? new Date(trust.exp).toISOString() : null,
        emergencyKeyConfigured: (process.env.ADMIN_EMERGENCY_KEY ?? "").trim().length >= 16,
      }}
    />
  );
}
