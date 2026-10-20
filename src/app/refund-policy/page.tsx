import type { Metadata } from "next";
import { getPublishedLegal } from "@/lib/services/legal";
import LegalPageView from "@/components/LegalPageView";

export const metadata: Metadata = {
  title: "Refund policy",
  description: "Clyvro's refund policy for paid plans: when refunds apply, how to request one, and how long they take.",
  alternates: { canonical: "/refund-policy" },
};
export const dynamic = "force-dynamic";

/** Public refund policy — admin-editable; built-in policy until published. */
export default async function RefundPolicyPage() {
  const legal = await getPublishedLegal("refund");
  return <LegalPageView title={legal.title} body={legal.body} publishedAt={legal.publishedAt} />;
}
