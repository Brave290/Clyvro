import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.CLYVRO_DB_MEMORY = "1";

type DB = import("@/lib/db").DB;
let db: DB;
let schema: typeof import("@/lib/db/schema");
let accounts: typeof import("@/lib/services/accounts");
let auditsSvc: typeof import("@/lib/services/audits");
let verifySvc: typeof import("@/lib/services/domain-verification");
let entitlements: typeof import("@/lib/services/entitlements");
let notifications: typeof import("@/lib/services/notifications");
let adminSvc: typeof import("@/lib/services/admin");
let legalSvc: typeof import("@/lib/services/legal");
let waitlistSvc: typeof import("@/lib/services/waitlist");
let jobs: typeof import("@/lib/jobs");
let neonAuth: typeof import("@/lib/neon-auth");

beforeAll(async () => {
  const dbMod = await import("@/lib/db");
  db = await dbMod.createDb();
  schema = await import("@/lib/db/schema");
  accounts = await import("@/lib/services/accounts");
  auditsSvc = await import("@/lib/services/audits");
  verifySvc = await import("@/lib/services/domain-verification");
  entitlements = await import("@/lib/services/entitlements");
  notifications = await import("@/lib/services/notifications");
  adminSvc = await import("@/lib/services/admin");
  legalSvc = await import("@/lib/services/legal");
  waitlistSvc = await import("@/lib/services/waitlist");
  jobs = await import("@/lib/jobs");
  neonAuth = await import("@/lib/neon-auth");
}, 60_000);

afterAll(async () => { /* in-memory PGlite is discarded with the process */ });

async function orgWithPlan(email: string, planId: string) {
  const acc = await accounts.registerAccount({ name: "QA", email, password: "a-long-password-123" }, db);
  await db.update(schema.organizations).set({ planId }).where(eq(schema.organizations.id, acc.organizationId));
  return acc;
}

describe("DNS domain verification", () => {
  it("stores only the token hash, verifies server-side, and is org-scoped", async () => {
    const acc = await orgWithPlan("verify@example.com", "pro");
    const issued = await verifySvc.issueDomainVerification(acc.organizationId, acc.userId, "https://www.example-site.com/deep", db);
    expect(issued.domain).toBe("example-site.com");
    expect(issued.recordName).toBe("_clyvro-verify.example-site.com");

    const [row] = await db.select().from(schema.domainVerifications).where(eq(schema.domainVerifications.id, issued.id));
    expect(row.tokenHash).not.toContain(issued.recordValue);
    expect(row.tokenHash).toBe(createHash("sha256").update(issued.recordValue).digest("hex"));

    // Wrong TXT content does not verify.
    await expect(verifySvc.checkDomainVerification(acc.organizationId, issued.id,
      { resolveTxt: async () => [["clyvro-verification=wrong"]], now: () => Date.now() + 30_000 }, db))
      .rejects.toMatchObject({ code: "VALIDATION" });

    // Another organization cannot check (or hijack) this record.
    const other = await orgWithPlan("verify-other@example.com", "pro");
    await expect(verifySvc.checkDomainVerification(other.organizationId, issued.id,
      { resolveTxt: async () => [[issued.recordValue]], now: () => Date.now() + 60_000 }, db))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    // Correct TXT verifies — only via the server-side lookup.
    const ok = await verifySvc.checkDomainVerification(acc.organizationId, issued.id,
      { resolveTxt: async () => [[issued.recordValue]], now: () => Date.now() + 90_000 }, db);
    expect(ok.status).toBe("verified");
    expect(await verifySvc.isDomainVerified(acc.organizationId, "example-site.com", db)).toBe(true);
    expect(await verifySvc.isDomainVerified(other.organizationId, "example-site.com", db)).toBe(false);
  }, 30_000);

  it("blocks deep scans until verified, then allows them", async () => {
    const acc = await orgWithPlan("deep-gate@example.com", "pro");
    await expect(auditsSvc.startAudit(acc.organizationId, acc.userId, null,
      { url: "https://github.com", scanMode: "deep", consent: true }, db))
      .rejects.toMatchObject({ code: "DOMAIN_NOT_VERIFIED" });

    const issued = await verifySvc.issueDomainVerification(acc.organizationId, acc.userId, "github.com", db);
    await verifySvc.checkDomainVerification(acc.organizationId, issued.id,
      { resolveTxt: async () => [[issued.recordValue]] }, db);

    const { auditId } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null,
      { url: "https://github.com", scanMode: "deep", consent: true }, db);
    const [row] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
    expect(row.scanMode).toBe("deep");
    expect(row.consentAt).toBeTruthy();
  }, 30_000);

  it("expires stale tokens", async () => {
    const acc = await orgWithPlan("verify-exp@example.com", "pro");
    const issued = await verifySvc.issueDomainVerification(acc.organizationId, acc.userId, "expire.example.com", db);
    await db.update(schema.domainVerifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.domainVerifications.id, issued.id));
    await expect(verifySvc.checkDomainVerification(acc.organizationId, issued.id,
      { resolveTxt: async () => [[issued.recordValue]] }, db))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const [row] = await db.select().from(schema.domainVerifications).where(eq(schema.domainVerifications.id, issued.id));
    expect(row.status).toBe("expired");
  }, 30_000);
});

describe("scan job reliability", () => {
  it("times out an overdue job, preserves progress, and never charges", async () => {
    const acc = await orgWithPlan("timeout@example.com", "pro");
    const { auditId } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null, { url: "https://github.com" }, db);
    await db.update(schema.audits)
      .set({ status: "running", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })
      .where(eq(schema.audits.id, auditId));
    await db.update(schema.scanJobs).set({
      status: "running",
      checkpoint: {
        version: 2, locale: "en", target: "https://github.com/", startedAt: new Date().toISOString(), deadlineAt: Date.now() + 60_000,
        limits: { maxPages: 10, maxLinkChecks: 20, maxDepth: 2 }, auditTypes: ["generic"],
        crawl: { phase: "crawl", robotsFetched: true, robots: [], startOutcome: { requestedUrl: "https://github.com/", finalUrl: "https://github.com/", contentType: "text/html", isHtml: true, status: 200, bytes: 1, truncated: false, durationMs: 1, redirectChain: [] }, pages: [], queue: [], visited: [], discovered: [], fetches: [], referrers: [], failures: [], coverage: { pagesFetched: 7, pagesParsed: 6, linksDiscovered: 12, linksChecked: 3, linksUnchecked: 9, formDestinationsChecked: 0, skippedByRobots: 0, truncatedPages: 0, maxPages: 10, maxDepth: 2, deadlineHit: false }, robotsSkipped: [], verifyQueue: [], verifyIndex: 0 },
      } as never,
    }).where(eq(schema.scanJobs.auditId, auditId));

    const timedOut = await jobs.timeoutOverdueJobs(db);
    expect(timedOut).toBeGreaterThanOrEqual(1);
    const detail = await auditsSvc.getAuditDetail(acc.organizationId, auditId, db);
    expect(detail.audit.status).toBe("timed_out");
    expect((detail.audit.coverage as { pagesFetched?: number } | null)?.pagesFetched).toBe(7);
    const [job] = await db.select().from(schema.scanJobs).where(eq(schema.scanJobs.auditId, auditId));
    expect(job.status).toBe("timed_out");
    expect(await auditsSvc.monthlyScanUsage(acc.organizationId, db)).toBe(0);
  }, 30_000);

  it("cancels for free and retries in place with entitlements re-checked", async () => {
    const acc = await orgWithPlan("cancel@example.com", "freemium");
    const { auditId } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null, { url: "https://github.com" }, db);
    await auditsSvc.cancelAudit(acc.organizationId, auditId, db);
    let detail = await auditsSvc.getAuditDetail(acc.organizationId, auditId, db);
    expect(detail.audit.status).toBe("cancelled");
    expect(await auditsSvc.monthlyScanUsage(acc.organizationId, db)).toBe(0);

    await auditsSvc.retryAudit(acc.organizationId, auditId, db);
    detail = await auditsSvc.getAuditDetail(acc.organizationId, auditId, db);
    expect(detail.audit.status).toBe("queued");
    const [job] = await db.select().from(schema.scanJobs).where(eq(schema.scanJobs.auditId, auditId));
    expect(job.status).toBe("queued");
  }, 30_000);

  it("settlement is idempotent and failed/timed-out work is free", async () => {
    const acc = await orgWithPlan("settle@example.com", "freemium");
    const { auditId } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null, { url: "https://github.com" }, db);
    const audit = { id: auditId, organizationId: acc.organizationId };
    await entitlements.settleScanUsage(db, audit, "completed");
    await entitlements.settleScanUsage(db, audit, "completed");
    expect(await auditsSvc.monthlyScanUsage(acc.organizationId, db)).toBe(1);
    const { auditId: audit2 } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null, { url: "https://github.com" }, db);
    await entitlements.settleScanUsage(db, { id: audit2, organizationId: acc.organizationId }, "timed_out");
    expect(await auditsSvc.monthlyScanUsage(acc.organizationId, db)).toBe(1);
  }, 30_000);

  it("concurrent starts cannot overrun the quota", async () => {
    const acc = await orgWithPlan("race@example.com", "freemium");
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => auditsSvc.startAudit(acc.organizationId, acc.userId, null, { url: "https://github.com" }, db)),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(2);
  }, 60_000);
});

describe("plans: owner life grant + expiry degradation", () => {
  it("owner is Ultra for life; lapsed customers degrade to Freemium", async () => {
    const owner = await accounts.registerAccount({ name: "Founder", email: "legateakanjimusab@gmail.com", password: "a-long-password-123" }, db);
    await entitlements.ensureOwnerLifeGrant(db);
    const [ownerOrg] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, owner.organizationId));
    expect(ownerOrg.planId).toBe("ultra-agency");
    expect(ownerOrg.planExpiresAt).toBeNull();

    const lapsed = await orgWithPlan("lapsed@example.com", "pro");
    await db.update(schema.organizations)
      .set({ planExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.organizations.id, lapsed.organizationId));
    const { degraded } = await entitlements.reconcileExpiredPlans(db);
    expect(degraded).toBeGreaterThanOrEqual(1);
    const [lapsedOrg] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, lapsed.organizationId));
    expect(lapsedOrg.planId).toBe("freemium");
    const [ownerOrgAfter] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, owner.organizationId));
    expect(ownerOrgAfter.planId).toBe("ultra-agency");
  }, 30_000);
});

describe("notifications outbox", () => {
  it("dedupes events and respects user preferences", async () => {
    const acc = await orgWithPlan("notify@example.com", "freemium");
    const input = {
      organizationId: acc.organizationId, userId: acc.userId, kind: "scan_completed",
      dedupeKey: `scan_completed:test-${acc.userId}`, toEmail: "notify@example.com",
      subject: "Done", body: "Finished.",
    };
    expect(await notifications.enqueueNotification(input, db)).toBe(true);
    expect(await notifications.enqueueNotification(input, db)).toBe(false);

    const sentTo: string[] = [];
    const result = await notifications.flushNotificationOutbox({
      sender: async (m) => { sentTo.push(m.to); return { sent: true } as const; },
    }, db);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(sentTo.filter((t) => t === "notify@example.com")).toHaveLength(1);
    const [row] = await db.select().from(schema.notificationOutbox)
      .where(eq(schema.notificationOutbox.dedupeKey, input.dedupeKey));
    expect(row.status).toBe("sent");

    await db.update(schema.users).set({ notifyPrefs: { scanResults: false } }).where(eq(schema.users.id, acc.userId));
    expect(await notifications.enqueueUserNotification({ ...input, category: "scanResults", dedupeKey: `other:${acc.userId}` }, db)).toBe(false);
  }, 30_000);
});

describe("admin control center", () => {
  it("rejects normal users, promotes env admins, keeps overrides distinct from purchases", async () => {
    const normal = await orgWithPlan("plain@example.com", "basic");
    await expect(adminSvc.requireAdminUser(normal.userId, db)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const boss = await accounts.registerAccount({ name: "Boss", email: "legateakanjimusab@gmail.com", password: "a-long-password-123" }, db).catch(() => null);
    // The owner account may already exist from the life-grant test; fetch either way.
    const [bossRow] = boss
      ? [{ id: boss.userId }]
      : await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, "legateakanjimusab@gmail.com"));
    const actor = await adminSvc.requireAdminUser(bossRow.id, db);
    expect(actor.email).toBe("legateakanjimusab@gmail.com");

    await adminSvc.setAdminPlanOverride(actor, normal.organizationId, "pro", "Beta partner", db);
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, normal.organizationId));
    expect(org.planId).toBe("basic"); // purchased plan untouched
    expect(org.adminPlanId).toBe("pro");
    const { effectivePlanForOrg } = await import("@/lib/plans");
    expect(effectivePlanForOrg(org).id).toBe("pro");

    await adminSvc.setUserSuspended(actor, normal.userId, true, db);
    const [suspended] = await db.select({ suspendedAt: schema.users.suspendedAt }).from(schema.users).where(eq(schema.users.id, normal.userId));
    expect(suspended.suspendedAt).toBeTruthy();

    await expect(adminSvc.setUserSuspended(actor, actor.userId, true, db)).rejects.toMatchObject({ code: "VALIDATION" });
  }, 30_000);
});

describe("legal pages", () => {
  it("drafts don't go live until published; publishing keeps revisions; content is sanitized", async () => {
    await legalSvc.saveLegalDraft("admin@example.com", { slug: "refund", title: "Refund policy", body: "First version.<script>alert(1)</script>" }, db);
    let published = await legalSvc.getPublishedLegal("refund", db);
    expect(published.body).toContain("How Clyvro billing works"); // built-in default still live

    await legalSvc.publishLegal("admin@example.com", "refund", db);
    published = await legalSvc.getPublishedLegal("refund", db);
    expect(published.body).toContain("First version.");
    expect(published.body).not.toContain("<script>");

    await legalSvc.saveLegalDraft("admin@example.com", { slug: "refund", title: "Refund policy", body: "Second version." }, db);
    await legalSvc.publishLegal("admin@example.com", "refund", db);
    const row = await legalSvc.getLegalRow("refund", db);
    expect((row?.revisions as unknown[]).length).toBe(1);
    published = await legalSvc.getPublishedLegal("refund", db);
    expect(published.body).toContain("Second version.");
  }, 30_000);
});

describe("waitlist", () => {
  it("persists signups, emails via the outbox once, and dedupes repeats", async () => {
    const first = await waitlistSvc.joinWaitlist({ email: "Wait@Example.com", role: "Developer" }, db);
    expect(first.joined).toBe(true);
    const second = await waitlistSvc.joinWaitlist({ email: "wait@example.com", role: "Developer" }, db);
    expect(second.alreadyJoined).toBe(true);
    const rows = await db.select().from(schema.waitlistSignups).where(eq(schema.waitlistSignups.email, "wait@example.com"));
    expect(rows).toHaveLength(1);
    const outbox = await db.select().from(schema.notificationOutbox)
      .where(eq(schema.notificationOutbox.dedupeKey, "waitlist-confirm:wait@example.com"));
    expect(outbox).toHaveLength(1);
  }, 30_000);
});

describe("Neon Auth transition", () => {
  it("bridge tokens are signed, expiring, and tamper-proof; status is honest", () => {
    const token = neonAuth.createBridgeToken("user-1", "a@example.com", 1_000_000);
    expect(neonAuth.verifyBridgeToken(token, 1_000_100)).toEqual({ userId: "user-1", email: "a@example.com" });
    expect(neonAuth.verifyBridgeToken(token, 1_000_000 + 6 * 60 * 1000)).toBeNull();
    expect(neonAuth.verifyBridgeToken(`${token}x`, 1_000_100)).toBeNull();
    const status = neonAuth.authProvidersStatus();
    expect(status.credentials).toBe(true);
    expect(typeof status.google).toBe("boolean");
    expect(typeof status.neonAuth).toBe("boolean");
  });
});
