process.env.CLYVRO_DB_MEMORY = "1";
process.env.R2_ACCOUNT_ID = "testaccount";
process.env.R2_ACCESS_KEY_ID = "test-key-id";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET = "test-bucket";

import { describe, expect, it, vi } from "vitest";

/** In-memory stand-in for Cloudflare R2's S3 endpoint. */
const store = new Map<string, string>();
vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: unknown }) => {
  const u = new URL(url);
  const key = decodeURIComponent(u.pathname.replace(/^\/test-bucket\//, ""));
  const method = init?.method ?? "GET";
  if (method === "PUT") {
    store.set(key, Buffer.from(init?.body as Buffer).toString("utf8"));
    return { ok: true, status: 200, text: async () => "" };
  }
  if (method === "GET") {
    const body = store.get(key);
    return body === undefined
      ? { ok: false, status: 404, text: async () => "NoSuchKey" }
      : { ok: true, status: 200, text: async () => body };
  }
  if (method === "DELETE") {
    store.delete(key);
    return { ok: true, status: 204, text: async () => "" };
  }
  return { ok: false, status: 400, text: async () => "" };
});

describe("R2 workspace backup → preview → restore roundtrip", () => {
  it("archives real rows, previews honestly and restores fresh copies (never overwrites)", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const accounts = await import("@/lib/services/accounts");
    const backups = await import("@/lib/services/backups");

    const acct = await accounts.registerAccount(
      { name: "Bk", email: "backup@example.com", password: "a-long-password-123" }, db);
    const { newId } = await import("@/lib/db");
    const project = { id: newId(), organizationId: acct.organizationId, clientId: null, name: "Site", siteUrl: "https://Example.com/", createdBy: acct.userId };
    await db.insert(schema.projects).values(project);

    const created = await backups.createBackup(acct.organizationId, acct.userId, "workspace", db);
    expect(created.scope).toBe("workspace");
    expect(created.manifest.projects).toBe(1);
    expect(created.sizeBytes).toBeGreaterThan(50);
    expect(store.size).toBe(1);

    const listed = await backups.listBackups(acct.organizationId, false, db);
    expect(listed.map((b) => b.id)).toContain(created.id);

    const preview = await backups.previewRestore(acct.organizationId, created.id, acct.userId, db);
    expect(preview.workspaces[0].restorableHere).toBe(true);
    expect(preview.workspaces[0].counts.projects).toBe(1);
    expect(preview.notes.join(" ")).toContain("never overwrites");

    const result = await backups.applyRestore(acct.organizationId, created.id, acct.userId, db);
    expect(result.restored.projects).toBe(1);

    const projects = await db.select().from(schema.projects)
      .where(eq(schema.projects.organizationId, acct.organizationId));
    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.id)).toContain(project.id);
    expect(new Set(projects.map((p) => p.id)).size).toBe(2); // copies got NEW ids

    // Cross-workspace theft is refused.
    const other = await accounts.registerAccount(
      { name: "Other", email: "other-backup@example.com", password: "a-long-password-123" }, db);
    await expect(backups.previewRestore(other.organizationId, created.id, other.userId, db))
      .rejects.toThrow(/another workspace|owner-admin/);
  });

  it("refuses to pretend when R2 is not configured", async () => {
    const saved = { ...process.env };
    delete process.env.R2_ACCESS_KEY_ID;
    try {
      const backups = await import("@/lib/services/backups");
      expect(backups.r2Configured()).toBe(false);
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it("admin Backup & Restore: platform backup restores into its own workspace; non-admins refused", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const accounts = await import("@/lib/services/accounts");
    const backups = await import("@/lib/services/backups");
    const { newId } = await import("@/lib/db");

    const admin = await accounts.registerAccount(
      { name: "Admin", email: "platform-admin@example.com", password: "a-long-password-123" }, db);
    // Promote this account's user to platform admin.
    const { eq } = await import("drizzle-orm");
    await db.update(schema.users).set({ isPlatformAdmin: true }).where(eq(schema.users.id, admin.userId));

    const project = { id: newId(), organizationId: admin.organizationId, clientId: null, name: "AdminSite", siteUrl: "https://admin.example/", createdBy: admin.userId };
    await db.insert(schema.projects).values(project);

    const created = await backups.createBackup(admin.organizationId, admin.userId, "platform", db);
    expect(created.scope).toBe("platform");

    const preview = await backups.previewRestore(admin.organizationId, created.id, admin.userId, db);
    expect(preview.workspaces[0].exists).toBe(true);

    // A regular (non-admin) user cannot run a platform restore.
    const regular = await accounts.registerAccount(
      { name: "Reg", email: "regular@example.com", password: "a-long-password-123" }, db);
    await expect(backups.applyPlatformRestore(created.id, regular.userId, db)).rejects.toThrow(/admin/i);

    const result = await backups.applyPlatformRestore(created.id, admin.userId, db);
    expect(result.skippedWorkspaces).toEqual([]);
    expect(result.restoredWorkspaces).toHaveLength(1);
    expect(result.restoredWorkspaces[0].counts.projects).toBe(1);

    const projects = await db.select().from(schema.projects)
      .where(eq(schema.projects.organizationId, admin.organizationId));
    expect(projects).toHaveLength(2); // original + restored copy, never overwritten
  });
});
