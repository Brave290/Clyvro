import LocalDateTime from "@/components/LocalDateTime";

/**
 * Renders a published legal page (plain text stored by admins). Text is
 * rendered as escaped React text — paragraphs split on blank lines; a
 * short Title-Case line is treated as a heading. No raw HTML is ever
 * injected, so admin-editable content has no XSS surface.
 */
export default function LegalPageView({ title, body, publishedAt }: { title: string; body: string; publishedAt: string | null }) {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="animate-fade-up text-4xl font-bold tracking-tight">{title}</h1>
      {publishedAt && (
        <p className="mt-2 text-sm text-ink-mute">Last published <LocalDateTime value={publishedAt} format="date" /></p>
      )}
      <div className="mt-8 space-y-5 leading-relaxed text-ink-soft">
        {paragraphs.map((para, i) => {
          const isHeading = para.length <= 60 && !/[.!?:]$/.test(para) && !para.includes("\n");
          return isHeading
            ? <h2 key={i} className="pt-3 text-lg font-semibold text-ink">{para}</h2>
            : <p key={i}>{para}</p>;
        })}
      </div>
    </div>
  );
}
