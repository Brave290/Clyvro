import type { Metadata } from "next";
import { getPublishedLegal } from "@/lib/services/legal";
import LegalPageView from "@/components/LegalPageView";

export const metadata: Metadata = { title: "Refund policy" };
export const dynamic = "force-dynamic";

/** Public refund policy — admin-editable; built-in policy until published. */
export default async function RefundPolicyPage() {
  const legal = await getPublishedLegal("refund");
  return <LegalPageView title={legal.title} body={legal.body} publishedAt={legal.publishedAt} />;
}
