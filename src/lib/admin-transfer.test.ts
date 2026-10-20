process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";

describe("owner protection + admin project transfer", () => {
  it("owner account can't be deleted/suspended by anyone; projects transfer by email with their audits", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const accounts = await import("@/lib/services/accounts");
    const admin = await import("@/lib/services/admin");
    const accountSvc = await import("@/lib/services/account");
    const auditsSvc = await import("@/lib/services/audits");

    // The platform owner (life-grant email) and a second platform admin.
    const owner = await accounts.registerAccount(
      { name: "Owner", email: "legateakanjimusab@gmail.com", password: "a-long-password-123" }, db);
    const second = await accounts.registerAccount(
      { name: "Admin2", email: "admin2@example.com", password: "a-long-password-123" }, db);
    await db.update(schema.users).set({ isPlatformAdmin: true }).where(eq(schema.users.id, second.userId));
    const actor = await admin.requireAdminUser(second.userId, db);

    // Owner is undeletable + unsuspendable via admin, and can't self-delete.
    await expect(admin.deleteUserAsAdmin(actor, owner.userId, db))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.deleteUserAsAdmin(actor, owner.userId, db))
      .rejects.toThrow(/owner account can't be deleted/);
    await expect(admin.setUserSuspended(actor, owner.userId, true, db))
      .rejects.toThrow(/owner account can't be suspended/);
    await expect(accountSvc.deleteAccount(owner.userId, "legateakanjimusab@gmail.com", db))
      .rejects.toThrow(/owner account can't be deleted/);
    // The owner row is untouched.
    const [ownerRow] = await db.select().from(schema.users).where(eq(schema.users.id, owner.userId));
    expect(ownerRow).toBeTruthy();
    expect(ownerRow.suspendedAt).toBeNull();

    // Ordinary users can still be deleted by an admin (no over-blocking).
    const plain = await accounts.registerAccount(
      { name: "Plain", email: "plain@example.com", password: "a-long-password-123" }, db);
    await expect(admin.deleteUserAsAdmin(actor, plain.userId, db)).resolves.toMatchObject({ deleted: true });

    // --- Project transfer by email ---
    const source = await accounts.registerAccount(
      { name: "Seller", email: "seller@example.com", password: "a-long-password-123" }, db);
    const recipient = await accounts.registerAccount(
      { name: "Buyer", email: "buyer@example.com", password: "a-long-password-123" }, db);
    const project = await auditsSvc.createProject(source.organizationId, source.userId, {
      name: "Handover site", siteUrl: "https://github.com",
    }, db);
    const { auditId } = await auditsSvc.startAudit(source.organizationId, source.userId, project.id, {}, db);
    expect((await auditsSvc.getAuditDetail(source.organizationId, auditId, db)).audit.id).toBe(auditId);
    await expect(auditsSvc.getAuditDetail(recipient.organizationId, auditId, db))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    // Unknown accounts are refused honestly — no silent account creation.
    await expect(admin.transferProjectAsAdmin(actor, project.id, "ghost@example.com", db))
      .rejects.toThrow(/No Clyvro account uses/);

    // Transfer (email match is case-insensitive); project + audit move together.
    const result = await admin.transferProjectAsAdmin(actor, project.id, "BUYER@Example.com", db);
    expect(result.toOrganizationId).toBe(recipient.organizationId);
    const [moved] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
    expect(moved.organizationId).toBe(recipient.organizationId);
    expect((await auditsSvc.getAuditDetail(recipient.organizationId, auditId, db)).audit.id).toBe(auditId);
    await expect(auditsSvc.getAuditDetail(source.organizationId, auditId, db))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    const recipientProjects = await auditsSvc.listProjects(recipient.organizationId, db);
    expect(recipientProjects.map((p) => p.id)).toContain(project.id);

    // Transferring to the workspace that already has it is refused.
    await expect(admin.transferProjectAsAdmin(actor, project.id, "buyer@example.com", db))
      .rejects.toThrow(/already has this project/);

    // The handover is in the admin audit log.
    const log = await db.select().from(schema.adminAuditLog)
      .where(eq(schema.adminAuditLog.action, "project.transferred"));
    expect(log).toHaveLength(1);
    expect(log[0].actorEmail).toBe("admin2@example.com");
  }, 60_000);
});
