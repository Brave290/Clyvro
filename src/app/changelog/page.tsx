import type { Metadata } from "next";
import { listPublishedChangelog, CHANGELOG_TAG_LABELS, type ChangelogTag } from "@/lib/services/changelog";

export const metadata: Metadata = {
  title: "What's new — what we fixed for you",
  description: "Every update to Clyvro, in plain words: what's new, what's better, what we fixed — as it ships.",
  alternates: { canonical: "/changelog" },
};
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

function tagLabel(tag: string): string {
  return CHANGELOG_TAG_LABELS[tag as ChangelogTag] ?? "Update";
}

export default async function ChangelogPage() {
  const entries = await listPublishedChangelog();
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="animate-fade-up text-4xl font-bold tracking-tight">What's new</h1>
      <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-4 leading-relaxed text-ink-soft">
        Everything we've added or fixed for you — in plain words. If it's listed here, it's live and working.
        If it's not ready yet, we don't list it. No "coming soon" tricks.
      </p>

      {entries.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-line bg-surface p-6 text-sm text-ink-soft">
          Nothing new to tell you just yet — when we ship something that helps you, it will appear here.
        </div>
      ) : (
        <ol className="mt-10 space-y-6">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <time dateTime={entry.publishedAt ?? undefined} className="font-semibold text-ink-mute">
                  {entry.publishedAt ? dateFmt.format(new Date(entry.publishedAt)) : ""}
                </time>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent-deep">
                  {tagLabel(entry.tag)}
                </span>
                {entry.version && (
                  <span className="rounded-full border border-line px-2 py-0.5 font-semibold text-ink-soft">{entry.version}</span>
                )}
              </div>
              <h2 className="mt-3 text-xl font-bold tracking-tight">{entry.title}</h2>
              <div className="mt-2 space-y-3 leading-relaxed text-ink-soft">
                {entry.body.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i} className="whitespace-pre-line">{paragraph}</p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
