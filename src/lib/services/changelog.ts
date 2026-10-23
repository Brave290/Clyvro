import { desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { adminAuditLog, changelogEntries } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import { sanitizeLegalText } from "@/lib/services/legal";

/**
 * Public changelog ("What's new"). Admin-managed from /admin/changelog:
 * entries start as drafts and only appear on the public /changelog page
 * once published. Bodies are plain text paragraphs, sanitized on write
 * (same treatment as legal pages) — no HTML injection surface. Every
 * mutation writes an admin audit log entry, like all other admin actions.
 */

export const CHANGELOG_TAGS = ["feature", "improvement", "fix", "announcement"] as const;
export type ChangelogTag = (typeof CHANGELOG_TAGS)[number];

export const CHANGELOG_TAG_LABELS: Record<ChangelogTag, string> = {
  feature: "New feature",
  improvement: "Improvement",
  fix: "Fix",
  announcement: "Announcement",
};

export interface ChangelogEntryView {
  id: string;
  title: string;
  body: string;
  tag: string;
  version: string | null;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

function toView(row: typeof changelogEntries.$inferSelect): ChangelogEntryView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tag: row.tag,
    version: row.version,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

function cleanInput(input: { title: string; body: string; tag: string; version?: string | null }) {
  const title = sanitizeLegalText(input.title).replace(/\s*\n\s*/g, " ").slice(0, 160);
  if (!title) throw new ScanError("VALIDATION", "Give the entry a title.");
  const body = sanitizeLegalText(input.body).slice(0, 20_000);
  if (!body) throw new ScanError("VALIDATION", "Write what changed — the entry body is empty.");
  const tag = (CHANGELOG_TAGS as readonly string[]).includes(input.tag) ? input.tag : "feature";
  const version = input.version ? sanitizeLegalText(input.version).replace(/\s*\n\s*/g, " ").slice(0, 40) || null : null;
  return { title, body, tag, version };
}

async function audit(db: DB, actorEmail: string, action: string, entryId: string, detail: Record<string, unknown>) {
  await db.insert(adminAuditLog).values({
    id: newId(), actorEmail, action, targetType: "changelog_entry", targetId: entryId, detail,
  });
}

/** Always-on shipped notes so /changelog isn't empty while admin drafts catch up. */
export const SHIPPED_NOTES: ChangelogEntryView[] = [
  {
    id: "shipped-cli-0.4.0",
    title: "Clyvro CLI on every machine — every website tool in the terminal",
    body:
      "Install the clyvro command on Alpine, Arch, Debian, macOS, Windows, and WSL. Then clyvro help lists every command.\n\n" +
      "Linux/macOS: curl -fsSL https://clyvro.vercel.app/install.sh | sh\n" +
      "Alpine: apk add --no-cache nodejs, then the same script.\n" +
      "Arch: pacman -S nodejs, then the same script.\n" +
      "Windows: irm https://clyvro.vercel.app/install.ps1 | iex\n" +
      "Any OS with npm: npm i -g https://clyvro.vercel.app/cli/clyvro.tgz\n\n" +
      "From the terminal (or MCP): scan, pentest, flow, lab, lab-scan, hack, seo, readiness, ai, ssl, dns, redirects, headers, robots, guard, review, whoami. Example: clyvro pentest https://your-site.com --consent\n\n" +
      "Code Reviewer still reads every line, detects the language, finds bugs, and tells you what to fix. Source is never stored.",
    tag: "feature",
    version: "CLI 0.4.0",
    status: "published",
    publishedAt: "2026-10-23T12:00:00.000Z",
    updatedAt: "2026-10-23T12:00:00.000Z",
    updatedBy: null,
  },
];

/** Public read: published entries only, newest first. Never throws — the page shows an empty state instead. */
export async function listPublishedChangelog(dbOverride?: DB, limit = 100): Promise<ChangelogEntryView[]> {
  try {
    const db = dbOverride ?? (await getDb());
    const rows = await db.select().from(changelogEntries)
      .where(eq(changelogEntries.status, "published"))
      .orderBy(desc(changelogEntries.publishedAt), desc(changelogEntries.createdAt))
      .limit(limit);
    const fromDb = rows.map(toView);
    const seen = new Set(fromDb.map((e) => e.id));
    const extra = SHIPPED_NOTES.filter((e) => !seen.has(e.id));
    return [...extra, ...fromDb]
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, limit);
  } catch {
    return SHIPPED_NOTES.slice(0, limit);
  }
}

/** Admin read: everything, drafts first then newest. */
export async function listAllChangelog(dbOverride?: DB): Promise<ChangelogEntryView[]> {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(changelogEntries)
    .orderBy(desc(changelogEntries.createdAt))
    .limit(200);
  return rows.map(toView).sort((a, b) => {
    if (a.status !== b.status) return a.status === "draft" ? -1 : 1;
    return (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt);
  });
}

export async function createChangelogEntry(
  actorEmail: string,
  input: { title: string; body: string; tag: string; version?: string | null },
  dbOverride?: DB,
) {
  const clean = cleanInput(input);
  const db = dbOverride ?? (await getDb());
  const id = newId();
  await db.insert(changelogEntries).values({ id, ...clean, status: "draft", updatedBy: actorEmail });
  await audit(db, actorEmail, "changelog.created", id, { title: clean.title, tag: clean.tag });
  return { id, created: true };
}

export async function updateChangelogEntry(
  actorEmail: string,
  input: { id: string; title: string; body: string; tag: string; version?: string | null },
  dbOverride?: DB,
) {
  if (!input.id) throw new ScanError("VALIDATION", "Missing entry.");
  const clean = cleanInput(input);
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(changelogEntries).where(eq(changelogEntries.id, input.id)).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "That entry no longer exists.");
  await db.update(changelogEntries)
    .set({ ...clean, updatedBy: actorEmail, updatedAt: new Date() })
    .where(eq(changelogEntries.id, input.id));
  await audit(db, actorEmail, "changelog.updated", input.id, { title: clean.title, tag: clean.tag, status: row.status });
  return { id: input.id, updated: true };
}

export async function setChangelogStatus(actorEmail: string, id: string, publish: boolean, dbOverride?: DB) {
  if (!id) throw new ScanError("VALIDATION", "Missing entry.");
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(changelogEntries).where(eq(changelogEntries.id, id)).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "That entry no longer exists.");
  await db.update(changelogEntries).set({
    status: publish ? "published" : "draft",
    // Keep the original publish date on re-publish so ordering stays truthful.
    publishedAt: publish ? (row.publishedAt ?? new Date()) : row.publishedAt,
    updatedBy: actorEmail,
    updatedAt: new Date(),
  }).where(eq(changelogEntries.id, id));
  await audit(db, actorEmail, publish ? "changelog.published" : "changelog.unpublished", id, { title: row.title });
  return { id, status: publish ? "published" : "draft" };
}

export async function deleteChangelogEntry(actorEmail: string, id: string, dbOverride?: DB) {
  if (!id) throw new ScanError("VALIDATION", "Missing entry.");
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(changelogEntries).where(eq(changelogEntries.id, id)).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "That entry no longer exists.");
  await db.delete(changelogEntries).where(eq(changelogEntries.id, id));
  await audit(db, actorEmail, "changelog.deleted", id, { title: row.title, wasStatus: row.status });
  return { id, deleted: true };
}
