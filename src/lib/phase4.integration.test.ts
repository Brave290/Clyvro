/**
 * Phase 4 integration tests — agency workspaces (clients), team roles +
 * invitations, branding gating, portfolio overview, permissions matrix, and
 * anti-abuse claims. Runs against embedded PGlite (real Postgres semantics),
 * no external network.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.CLYVRO_DB_MEMORY = "1";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "phase4-test-secret";

type DB = import("@/lib/db").DB;
let db: DB;
let registerAccount: typeof import("@/lib/services/accounts").registerAccount;
let clients: typeof import("@/lib/services/clients");
let team: typeof import("@/lib/services/team");
let orgs: typeof import("@/lib/services/orgs");
let abuse: typeof import("@/lib/services/abuse");
let audits: typeof import("@/lib/services/audits");
let perms: typeof import("@/lib/permissions");

async function setPlan(orgId: string, planId: string) {
  const { organizations } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(organizations).set({ planId }).where(eq(organizations.id, orgId));
}

beforeAll(async () => {
  db = await (await import("@/lib/db")).createDb();
  registerAccount = (await import("@/lib/services/accounts")).registerAccount;
  clients = await import("@/lib/services/clients");
  team = await import("@/lib/services/team");
  orgs = await import("@/lib/services/orgs");
  abuse = await import("@/lib/services/abuse");
  audits = await import("@/lib/services/audits");
  perms = await import("@/lib/permissions");
}, 60_000);

const register = (email: string) =>
  registerAccount({ name: "Tester", email, password: "a-long-password-123" }, db);

async function freshOrg(email: string) {
  const { userId, organizationId } = await register(email);
  return { ownerId: userId, orgId: organizationId };
}

describe("permissions matrix", () => {
  it("gates write and org management per role; unknown roles degrade to viewer", () => {
    expect(perms.canWrite("owner")).toBe(true);
    expect(perms.canWrite("admin")).toBe(true);
    expect(perms.canWrite("member")).toBe(true);
    expect(perms.canWrite("viewer")).toBe(false);
    expect(perms.canManageOrg("owner")).toBe(true);
    expect(perms.canManageOrg("admin")).toBe(true);
    expect(perms.canManageOrg("member")).toBe(false);
    expect(perms.canManageOrg("viewer")).toBe(false);
    expect(perms.canDeleteAllProjects("owner")).toBe(true);
    expect(perms.canDeleteAllProjects("admin")).toBe(false);
    expect(perms.canDeleteAllProjects("member")).toBe(false);
    expect(perms.canDeleteAllProjects("viewer")).toBe(false);
    expect(perms.normalizeRole("nonsense")).toBe("viewer");
    expect(perms.normalizeRole(null)).toBe("viewer");
    expect(perms.isRole("admin")).toBe(true);
    expect(perms.isRole("superuser")).toBe(false);
  });
});

describe("owner-only project-data deletion", () => {
  it("deletes every project for one workspace but preserves quota history and clients", async () => {
    const owner = await freshOrg("delete-owner@example.com");
    const other = await freshOrg("delete-other@example.com");
    await setPlan(owner.orgId, "ultra-agency");

    const client = await clients.createClient(owner.orgId, owner.ownerId, { name: "Keep this client" }, db);
    const active = await audits.createProject(
      owner.orgId, owner.ownerId,
      { name: "Active site", siteUrl: "https://github.com", clientId: client.id }, db,
    );
    const archived = await audits.createProject(
      owner.orgId, owner.ownerId,
      { name: "Archived site", siteUrl: "https://github.com" }, db,
    );
    const otherProject = await audits.createProject(
      other.orgId, other.ownerId,
      { name: "Other workspace site", siteUrl: "https://github.com" }, db,
    );

    const { projects: projectTable, audits: auditTable, scanJobs, usageEvents } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { newId } = await import("@/lib/db");
    await db.update(projectTable).set({ archivedAt: new Date() }).where(eq(projectTable.id, archived.id));

    const { auditId } = await audits.startAudit(owner.orgId, owner.ownerId, active.id, {}, db);
    await db.insert(usageEvents).values({ id: newId(), organizationId: owner.orgId, auditId });
    expect(await audits.monthlyScanUsage(owner.orgId, db)).toBe(1);

    const removed = await audits.deleteAllProjects(owner.orgId, db);
    expect(removed).toEqual({ projectsDeleted: 2, auditsDeleted: 1 });

    expect(await db.select().from(projectTable).where(eq(projectTable.organizationId, owner.orgId))).toHaveLength(0);
    expect(await db.select().from(auditTable).where(eq(auditTable.id, auditId))).toHaveLength(0);
    expect(await db.select().from(scanJobs).where(eq(scanJobs.auditId, auditId))).toHaveLength(0);
    expect(await db.select().from(projectTable).where(eq(projectTable.id, otherProject.id))).toHaveLength(1);
    expect(await db.select().from(usageEvents).where(eq(usageEvents.auditId, auditId))).toHaveLength(1);
    expect(await audits.monthlyScanUsage(owner.orgId, db)).toBe(1);
    expect(await clients.getClient(owner.orgId, client.id, db)).toMatchObject({ name: "Keep this client" });
  }, 30_000);
});

describe("agency clients", () => {
  it("creates, links, updates and deletes clients with org isolation", async () => {
    const a = await freshOrg("agency-a@example.com");
    const b = await freshOrg("agency-b@example.com");

    const client = await clients.createClient(a.orgId, a.ownerId, { name: "Harbor Logistics", contactName: "HS" }, db);
    expect(client.name).toBe("Harbor Logistics");

    // Project can be created under the client.
    const project = await audits.createProject(
      a.orgId, a.ownerId,
      { name: "Main site", siteUrl: "https://github.com", clientId: client.id },
      db,
    );
    expect(project.clientId).toBe(client.id);

    // Cross-org leakage blocked (reads and assignment look like "not found").
    await expect(clients.getClient(b.orgId, client.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      audits.createProject(b.orgId, b.ownerId, { name: "Sneaky", siteUrl: "https://github.com", clientId: client.id }, db),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Update + summaries.
    const updated = await clients.updateClient(a.orgId, client.id, { name: "Harbor Logistics Group" }, db);
    expect(updated.name).toContain("Group");
    const summary = (await clients.listClients(a.orgId, undefined, db)).find((s) => s.client.id === client.id);
    expect(summary?.projectCount).toBe(1);

    // Reassignment works within the org and rejects unknown clients.
    await clients.assignProjectClient(a.orgId, project.id, null, db);
    await expect(clients.assignProjectClient(a.orgId, project.id, "nope", db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await clients.assignProjectClient(a.orgId, project.id, client.id, db);
    expect((await audits.getProject(a.orgId, project.id, db)).clientId).toBe(client.id);

    // Deleting unlinks projects (history kept) and removes the client.
    await clients.deleteClient(a.orgId, client.id, db);
    await expect(clients.getClient(a.orgId, client.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await audits.getProject(a.orgId, project.id, db)).clientId).toBeNull();
    expect(await clients.listClients(a.orgId, undefined, db)).toEqual([]);
  });

  it("portfolio overview reports real counts only", async () => {
    const a = await freshOrg("portfolio@example.com");
    const client = await clients.createClient(a.orgId, a.ownerId, { name: "Northwind" }, db);
    await audits.createProject(a.orgId, a.ownerId, { name: "Shop", siteUrl: "https://github.com", clientId: client.id }, db);
    await setPlan(a.orgId, "basic"); // allow more than one project
    await audits.createProject(a.orgId, a.ownerId, { name: "Blog", siteUrl: "https://github.com" }, db);
    const o = await clients.portfolioOverview(a.orgId, db);
    expect(o.clientCount).toBe(1);
    expect(o.projectCount).toBe(2);
    expect(o.auditsLast30d).toBe(0);
    expect(o.failedLast30d).toBe(0);
    expect(o.openCriticalHigh).toBe(0);
    expect(o.staleClients.map((c) => c.name)).toEqual(["Northwind"]);
    expect(o.recentAudits).toEqual([]);
  });
});

describe("team roles and invitations", () => {
  it("invite → accept lifecycle: hashed, single-use, email-matched, seat-aware", async () => {
    const a = await freshOrg("team-owner@example.com");
    const invitee = await register("invitee@example.com");
    const other = await register("other@example.com");

    // Freemium has 1 seat (the owner) — inviting must be a plan limit.
    await expect(
      team.createInvitation(a.orgId, a.ownerId, "owner", { email: "invitee@example.com", role: "member" }, db),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT" });

    await setPlan(a.orgId, "pro"); // 3 seats

    const inv = await team.createInvitation(a.orgId, a.ownerId, "owner", { email: "invitee@example.com", role: "viewer" }, db);
    expect(inv.token).toMatch(/.{20,}/);
    const preview = await team.getInvitationPreview(inv.token, db);
    expect(preview).toMatchObject({ role: "viewer", email: "invitee@example.com" });
    expect(await team.getInvitationPreview("bogus-token", db)).toBeNull();

    // Wrong email cannot accept.
    await expect(team.acceptInvitation(other.userId, "other@example.com", inv.token, db))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    // Right email (case-insensitive) accepts; joins as viewer.
    const accepted = await team.acceptInvitation(invitee.userId, "Invitee@Example.com", inv.token, db);
    expect(accepted.organizationId).toBe(a.orgId);
    const joined = (await team.listMembers(a.orgId, db)).find((m) => m.userId === invitee.userId);
    expect(joined?.role).toBe("viewer");

    // Single use.
    await expect(team.acceptInvitation(invitee.userId, "invitee@example.com", inv.token, db))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    // Inviting an existing member is a validation error.
    await expect(team.createInvitation(a.orgId, a.ownerId, "owner", { email: "invitee@example.com", role: "member" }, db))
      .rejects.toMatchObject({ code: "VALIDATION" });

    // Ownership can't be handled like a normal role.
    await expect(team.changeMemberRole(a.orgId, a.ownerId, "owner", a.ownerId, "viewer", db))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(team.removeMember(a.orgId, a.ownerId, "owner", a.ownerId, db))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    // Owner can promote and remove ordinary members.
    const promoted = await team.changeMemberRole(a.orgId, a.ownerId, "owner", invitee.userId, "member", db);
    expect(promoted.role).toBe("member");
    await team.removeMember(a.orgId, a.ownerId, "owner", invitee.userId, db);
    const members = await team.listMembers(a.orgId, db);
    expect(members.map((m) => m.userId)).toEqual([a.ownerId]);
  });

  it("revoked invitations cannot be accepted; list never exposes raw tokens", async () => {
    const a = await freshOrg("team-owner2@example.com");
    await setPlan(a.orgId, "pro");
    const inv = await team.createInvitation(a.orgId, a.ownerId, "owner", { email: "late@example.com", role: "member" }, db);
    const listed = await team.listInvitations(a.orgId, db);
    expect(JSON.stringify(listed)).not.toContain(inv.token);
    await team.revokeInvitation(a.orgId, inv.id, db);
    const { userId } = await register("late@example.com");
    await expect(team.acceptInvitation(userId, "late@example.com", inv.token, db))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("branding", () => {
  it("validates colours and applies branding only when the plan includes white-label", async () => {
    const a = await freshOrg("brand@example.com");
    await expect(orgs.updateBranding(a.orgId, { brandColor: "red" }, db))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await expect(orgs.updateBranding(a.orgId, { brandColor: "#f5f5f5" }, db))
      .rejects.toMatchObject({ code: "VALIDATION" }); // too light to read on white
    await orgs.updateBranding(a.orgId, { brandName: "Studio Blue", brandColor: "#2563eb", reportFooter: "Prepared for Harbor Logistics" }, db);

    // Freemium: saved, but NOT applied publicly ("via Clyvro", default colour).
    const appliedFree = await orgs.getAppliedBranding(a.orgId, db);
    expect(appliedFree.viaClyvro).toBe(true);
    expect(appliedFree.color).toBeNull();

    // Ultra: applied as configured.
    await setPlan(a.orgId, "ultra-agency");
    const appliedUltra = await orgs.getAppliedBranding(a.orgId, db);
    expect(appliedUltra).toMatchObject({ name: "Studio Blue", color: "#2563eb", viaClyvro: false });

    // Unknown org errors rather than inventing branding.
    await expect(orgs.getAppliedBranding("ghost-org", db)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("anti-abuse claims (hashed, no raw IPs)", () => {
  it("allows one free scan per device+network, then requires sign-up", async () => {
    expect(await abuse.tryConsumePublicScan("203.0.113.9", "desktop|1600|en|UTC", db)).toBe(true);
    expect(await abuse.tryConsumePublicScan("203.0.113.9", "desktop|1600|en|UTC", db)).toBe(false);
    // Clearing cookies doesn't help (server-side), but a genuinely different
    // device on the same shared network still gets its free scan.
    expect(await abuse.tryConsumePublicScan("203.0.113.9", "mobile|390|en|UTC", db)).toBe(true);
    expect(abuse.claimHash("203.0.113.9", "desktop")).toMatch(/^[a-f0-9]{64}$/);
    expect(abuse.claimHash("203.0.113.9", "desktop")).not.toContain("203.0.113");
  });

  it("throttles repeat sign-ups from the same device+network", async () => {
    expect(await abuse.signupAllowed("203.0.113.10", "desktop|1440|en-US|UTC", db)).toBe(true);
    await abuse.recordSignup("203.0.113.10", "desktop|1440|en-US|UTC", db);
    expect(await abuse.signupAllowed("203.0.113.10", "desktop|1440|en-US|UTC", db)).toBe(false);
    expect(await abuse.signupAllowed("203.0.113.10", "tablet|800|en-US|UTC", db)).toBe(true);
  });
});
