import type { Metadata } from "next";
import EmergencyForm from "./EmergencyForm";

export const metadata: Metadata = {
  title: "Emergency access",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};
export const dynamic = "force-dynamic";

/**
 * Hidden administrator door. Not linked anywhere, not in the sitemap,
 * noindex, exempt from Shield blocks (so a banned address or Under-attack
 * mode can never lock the founder out) and guarded by its own strict,
 * logged throttle in /api/emergency/login.
 */
export default function EmergencyPage() {
  return <EmergencyForm />;
}
