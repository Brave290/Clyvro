import { getLegalRow, LEGAL_SLUGS } from "@/lib/services/legal";
import { AdminLegal } from "@/components/app/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  const legal = await Promise.all(LEGAL_SLUGS.map(async (slug) => {
    const row = await getLegalRow(slug);
    return {
      slug, title: row?.title ?? (slug === "refund" ? "Refund policy" : slug),
      draftBody: row?.draftBody ?? "",
      published: Boolean(row?.publishedBody),
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      revisions: Array.isArray(row?.revisions) ? (row.revisions as unknown[]).length : 0,
    };
  }));
  return <AdminLegal legal={legal} />;
}
