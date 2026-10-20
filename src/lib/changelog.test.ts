process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";

describe("changelog (admin-managed What's new)", () => {
  it("drafts stay hidden; publish shows; edit/unpublish/delete behave; audit log written", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const changelog = await import("@/lib/services/changelog");
    const actor = "admin@example.com";

    // Create → draft → invisible publicly.
    const { id } = await changelog.createChangelogEntry(actor, {
      title: "Test launch <script>alert(1)</script>",
      body: "Something shipped.\n\nSecond paragraph.",
      tag: "feature",
      version: "v9.9",
    }, db);
    // (Migration seeds are already published; our new draft must not be among them.)
    expect((await changelog.listPublishedChangelog(db)).find((e) => e.id === id)).toBeUndefined();
    const all = await changelog.listAllChangelog(db);
    // Seeds from the migration may exist; our entry must be among them as a draft, HTML stripped.
    const mine = all.find((e) => e.id === id)!;
    expect(mine.status).toBe("draft");
    expect(mine.title).not.toContain("<script>");
    expect(mine.version).toBe("v9.9");

    // Publish → visible, first-run publish date recorded.
    await changelog.setChangelogStatus(actor, id, true, db);
    let published = (await changelog.listPublishedChangelog(db)).filter((e) => e.id === id);
    expect(published).toHaveLength(1);
    expect(published[0].publishedAt).toBeTruthy();
    const firstPublishedAt = published[0].publishedAt;

    // Edit while published → content updates, entry stays published.
    await changelog.updateChangelogEntry(actor, {
      id, title: "Test launch (renamed)", body: "Updated body.", tag: "improvement", version: null,
    }, db);
    published = (await changelog.listPublishedChangelog(db)).filter((e) => e.id === id);
    expect(published[0].title).toBe("Test launch (renamed)");
    expect(published[0].tag).toBe("improvement");

    // Unpublish → hidden again; re-publish keeps the original date.
    await changelog.setChangelogStatus(actor, id, false, db);
    expect((await changelog.listPublishedChangelog(db)).filter((e) => e.id === id)).toHaveLength(0);
    await changelog.setChangelogStatus(actor, id, true, db);
    published = (await changelog.listPublishedChangelog(db)).filter((e) => e.id === id);
    expect(published[0].publishedAt).toBe(firstPublishedAt);

    // Validation: empty title/body refused; unknown tag falls back to "feature".
    await expect(changelog.createChangelogEntry(actor, { title: " ", body: "x", tag: "feature" }, db))
      .rejects.toThrow(/title/);
    await expect(changelog.createChangelogEntry(actor, { title: "T", body: " ", tag: "feature" }, db))
      .rejects.toThrow(/body is empty/);
    const weird = await changelog.createChangelogEntry(actor, { title: "T2", body: "B2", tag: "nonsense" }, db);
    expect((await changelog.listAllChangelog(db)).find((e) => e.id === weird.id)?.tag).toBe("feature");

    // Delete → gone everywhere; deleting again 404s.
    await changelog.deleteChangelogEntry(actor, id, db);
    expect((await changelog.listAllChangelog(db)).find((e) => e.id === id)).toBeUndefined();
    await expect(changelog.deleteChangelogEntry(actor, id, db)).rejects.toThrow(/no longer exists/);

    // Every mutation hit the admin audit log.
    const actions = (await db.select().from(schema.adminAuditLog)
      .where(eq(schema.adminAuditLog.targetId, id))).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining([
      "changelog.created", "changelog.published", "changelog.updated",
      "changelog.unpublished", "changelog.deleted",
    ]));
  });
});
