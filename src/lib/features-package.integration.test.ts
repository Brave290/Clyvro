import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.CLYVRO_DB_MEMORY = "1";

type DB = import("@/lib/db").DB;
let db: DB;
let schema: typeof import("@/lib/db/schema");
let accounts: typeof import("@/lib/services/accounts");
let auditsSvc: typeof import("@/lib/services/audits");
let resets: typeof import("@/lib/services/password-resets");
let cronSvc: typeof import("@/lib/services/cron-jobs");
let billingSvc: typeof import("@/lib/services/billing");
let accountSvc: typeof import("@/lib/services/account");

beforeAll(async () => {
  const dbMod = await import("@/lib/db");
  db = await dbMod.createDb();
  schema = await import("@/lib/db/schema");
  accounts = await import("@/lib/services/accounts");
  auditsSvc = await import("@/lib/services/audits");
  resets = await import("@/lib/services/password-resets");
  cronSvc = await import("@/lib/services/cron-jobs");
  billingSvc = await import("@/lib/services/billing");
  accountSvc = await import("@/lib/services/account");
}, 60_000);

const fakeTransport = (status = 200) => async () => ({
  status,
  header: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null),
  body: (async function* () { yield new TextEncoder().encode("<html>ok</html>"); })(),
  cancelBody: async () => undefined,
});

async function orgWithPlan(email: string, planId: string) {
  const acc = await accounts.registerAccount({ name: "QA", email, password: "a-long-password-123" }, db);
  await db.update(schema.organizations).set({ planId }).where(eq(schema.organizations.id, acc.organizationId));
  return acc;
}

describe("quick scans + deep-scan gates", () => {
  it("quick scan needs no saved website and shows in recent scans", async () => {
    const acc = await orgWithPlan("quick@example.com", "freemium");
    const { auditId } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null, { url: "https://github.com" }, db);
    const [row] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
    expect(row.projectId).toBeNull();
    expect(row.scanMode).toBe("normal");
    const recent = await auditsSvc.listRecentAudits(acc.organizationId, 8, db);
    expect(recent.some((r) => r.audit.id === auditId)).toBe(true);
  }, 30_000);

  it("deep scan is open to Basic but refuses once its monthly allowance is used up", async () => {
    // Founder rule: every plan can test deep scans; lower plans are
    // capped. Basic includes 3/month — burn them, then the gate bites.
    const acc = await orgWithPlan("deep-free@example.com", "basic");
    const { consumePremiumRun } = await import("@/lib/services/tool-access");
    await consumePremiumRun(acc.organizationId, "deep-scan", db);
    await consumePremiumRun(acc.organizationId, "deep-scan", db);
    await consumePremiumRun(acc.organizationId, "deep-scan", db);
    await expect(auditsSvc.startAudit(acc.organizationId, acc.userId, null,
      { url: "https://github.com", scanMode: "deep", consent: true }, db))
      .rejects.toMatchObject({ code: "PLAN_LIMIT" });
  }, 30_000);

  it("deep scan requires recorded ownership consent on Pro", async () => {
    const acc = await orgWithPlan("deep-pro@example.com", "pro");
    await expect(auditsSvc.startAudit(acc.organizationId, acc.userId, null,
      { url: "https://github.com", scanMode: "deep" }, db))
      .rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    // Consent alone is no longer enough: DNS ownership verification gates deep scans.
    await expect(auditsSvc.startAudit(acc.organizationId, acc.userId, null,
      { url: "https://github.com", scanMode: "deep", consent: true }, db))
      .rejects.toMatchObject({ code: "DOMAIN_NOT_VERIFIED" });
    const verifySvc = await import("@/lib/services/domain-verification");
    const issued = await verifySvc.issueDomainVerification(acc.organizationId, acc.userId, "github.com", db);
    await verifySvc.checkDomainVerification(acc.organizationId, issued.id,
      { resolveTxt: async () => [[issued.recordValue]] }, db);
    const { auditId } = await auditsSvc.startAudit(acc.organizationId, acc.userId, null,
      { url: "https://github.com", scanMode: "deep", consent: true }, db);
    const [row] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
    expect(row.scanMode).toBe("deep");
    expect(row.consentAt).toBeTruthy();
  }, 30_000);
});

describe("password resets", () => {
  it("stores only the hash, is single-use, and a new request kills old links", async () => {
    const acc = await orgWithPlan("reset@example.com", "freemium");
    const sent: Array<{ text: string; html?: string }> = [];
    const send = async (m: { text: string; html?: string }) => { sent.push(m); return { delivered: true } as never; };
    const first = await resets.requestPasswordReset("reset@example.com", { send }, db);
    expect(first.token).toBeTruthy();
    expect(sent[0]?.html).toContain("Clyvro");
    expect(sent[0]?.html).toContain("Choose a new password");
    expect(sent[0]?.text).toContain(first.token!);
    const rows = await db.select().from(schema.passwordResets).where(eq(schema.passwordResets.userId, acc.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(first.token);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const second = await resets.requestPasswordReset("reset@example.com", { send }, db);
    await expect(resets.resetPassword(first.token!, "brand-new-password-9", db)).rejects.toThrow();
    await resets.resetPassword(second.token!, "brand-new-password-9", db);
    await expect(resets.resetPassword(second.token!, "another-password-9", db)).rejects.toThrow();
  }, 30_000);

  it("unknown emails and OAuth-only accounts get no token (anti-enumeration)", async () => {
    const ghost = await resets.requestPasswordReset("nobody@example.com", {}, db);
    expect(ghost.token).toBeNull();
    await accounts.findOrCreateOAuthUser({ email: "oauth-only@example.com", name: "O" }, db);
    const oauth = await resets.requestPasswordReset("oauth-only@example.com", {}, db);
    expect(oauth.token).toBeNull();
  }, 30_000);
});

describe("Google/OAuth provisioning", () => {
  it("creates once, then links by email", async () => {
    const a = await accounts.findOrCreateOAuthUser({ email: "G-User@Example.com", name: "G" }, db);
    expect(a.created).toBe(true);
    expect(a.organizationId).toBeTruthy();
    const b = await accounts.findOrCreateOAuthUser({ email: "g-user@example.com" }, db);
    expect(b.created).toBe(false);
    expect(b.userId).toBe(a.userId);
  }, 30_000);
});

describe("customer cron jobs (our scheduler)", () => {
  it("enforces the plan quota and records runs", async () => {
    const acc = await orgWithPlan("cron@example.com", "freemium");
    const { id } = await cronSvc.createCronJob(acc.organizationId, acc.userId,
      { name: "Warm", url: "https://github.com", method: "GET", intervalMinutes: 60 }, db);
    await expect(cronSvc.createCronJob(acc.organizationId, acc.userId,
      { name: "Second", url: "https://github.com", method: "GET", intervalMinutes: 60 }, db))
      .rejects.toMatchObject({ code: "PLAN_LIMIT" });

    const [job] = await db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, id));
    const result = await cronSvc.executeCronJob(job, { transport: fakeTransport(204) as never }, db);
    expect(result).toMatchObject({ ok: true, status: 204 });
    const { runs } = (await cronSvc.listCronJobs(acc.organizationId, db))[0];
    expect(runs).toHaveLength(1);
  }, 30_000);

  it("captures the full server response of every run (status line, headers, body) and tracks failures", async () => {
    const acc = await orgWithPlan("cron-capture@example.com", "pro");
    const { id } = await cronSvc.createCronJob(acc.organizationId, acc.userId,
      { name: "Capture", url: "https://api.github.com/zen", method: "GET", intervalMinutes: 60 }, db);
    const [job] = await db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, id));
    const jsonTransport = (status: number) => async () => ({
      status,
      header: (n: string) => (n.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null),
      allHeaders: () => ({ "content-type": "application/json; charset=utf-8", "x-request-id": "abc123", "set-cookie": "sid=supersecret; Path=/; HttpOnly", server: "nginx" }),
      body: (async function* () { yield new TextEncoder().encode(JSON.stringify({ hello: "world", n: 1 })); })(),
      cancelBody: async () => undefined,
    });
    const ok = await cronSvc.executeCronJob(job, { transport: jsonTransport(200) as never, trigger: "manual" }, db);
    expect(ok.statusLine).toBe("HTTP 200 OK");
    expect(ok.trigger).toBe("manual");
    expect(ok.response.body).toBe(JSON.stringify({ hello: "world", n: 1 }));
    expect(ok.response.contentType).toContain("application/json");
    expect(ok.response.headers["x-request-id"]).toBe("abc123");
    expect(ok.response.headers["set-cookie"]).toBe("sid=[redacted]; Path=/; HttpOnly");
    expect(ok.durationMs).toBeGreaterThanOrEqual(0);

    const bad = await cronSvc.executeCronJob({ ...job, consecutiveFailures: 0 }, { transport: jsonTransport(503) as never }, db);
    expect(bad.ok).toBe(false);
    expect(bad.statusLine).toBe("HTTP 503 Service Unavailable");
    expect(bad.error).toBe("HTTP 503 Service Unavailable");

    const runs = await cronSvc.listCronJobRuns(acc.organizationId, id, db);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.status).toBe(503);
    expect(runs[0]!.responseBody).toContain("hello");
    expect(runs[0]!.responseHeaders?.server).toBe("nginx");
    expect(runs[1]!.trigger).toBe("manual");
    const [after] = await db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, id));
    expect(after.consecutiveFailures).toBe(1);
    expect(after.lastDurationMs).not.toBeNull();
    expect(cronSvc.statusLine(null)).toBe("No HTTP response");
    expect(cronSvc.statusLine(418)).toBe("HTTP 418");
  }, 30_000);

  it("refuses private/internal targets", async () => {
    const acc = await orgWithPlan("cron-ssrf@example.com", "pro");
    await expect(cronSvc.createCronJob(acc.organizationId, acc.userId,
      { name: "Evil", url: "http://127.0.0.1:8080/admin", method: "GET", intervalMinutes: 60 }, db))
      .rejects.toThrow();
  }, 30_000);

  it("runDueCronJobs executes overdue jobs and reschedules them", async () => {
    const acc = await orgWithPlan("cron-due@example.com", "pro");
    const { id } = await cronSvc.createCronJob(acc.organizationId, acc.userId,
      { name: "Due", url: "https://github.com", method: "GET", intervalMinutes: 30 }, db);
    await db.update(schema.cronJobs).set({ nextRunAt: new Date(Date.now() - 60_000) }).where(eq(schema.cronJobs.id, id));
    const { ran } = await cronSvc.runDueCronJobs({ limit: 5, transport: fakeTransport(200) as never }, db);
    expect(ran).toBeGreaterThanOrEqual(1);
    const [job] = await db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, id));
    expect(job.lastStatus).toBe(200);
    expect(job.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  }, 30_000);
});

describe("Flutterwave billing", () => {
  const flwFetch = (verifyAmount: number, verifyCurrency = "NGN", verifyStatus = "successful") =>
    async (url: string, init?: RequestInit) => {
      if (url.includes("/payments") && !url.includes("verify")) {
        const payload = JSON.parse(String(init?.body)) as { tx_ref: string; amount: number; currency: string };
        expect(payload.amount).toBe(75000);
        expect(payload.currency).toBe("NGN");
        expect(payload.tx_ref).toMatch(/^clyvro_[a-f0-9]+$/);
        return new Response(JSON.stringify({ status: "success", data: { link: "https://checkout.flutterwave.com/pay/test" } }), { status: 200 });
      }
      if (url.includes("verify_by_reference")) {
        const txRef = new URL(url).searchParams.get("tx_ref");
        return new Response(JSON.stringify({
          status: "success",
          data: { id: 42, tx_ref: txRef, status: verifyStatus, amount: verifyAmount, currency: verifyCurrency },
        }), { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    };

  it("refuses honestly when keys are missing", async () => {
    const acc = await orgWithPlan("billing-off@example.com", "freemium");
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    delete process.env.FLUTTERWAVE_PUBLIC_KEY;
    await expect(billingSvc.createCheckout(acc.organizationId, acc.userId, "pro", new Headers(), {}, db))
      .rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  }, 30_000);

  it("checkout → verify grants 30 days exactly once (idempotent)", async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-x";
    process.env.FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK_TEST-x";
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = "whsec-test";
    const acc = await orgWithPlan("billing@example.com", "freemium");
    const headers = new Headers({ "x-vercel-ip-country": "NG" });
    const checkout = await billingSvc.createCheckout(acc.organizationId, acc.userId, "pro", headers,
      { fetchImpl: flwFetch(75000) as never, declaredCountry: "NG" }, db);
    expect(checkout.link).toContain("flutterwave");
    expect(checkout.checkout.publicKey).toBe("FLWPUBK_TEST-x");
    expect(checkout.checkout.txRef).toMatch(/^clyvro_[a-f0-9]+$/);
    expect(checkout.checkout.amount).toBe(75000);
    expect(checkout.checkout.currency).toBe("NGN");
    expect(checkout.checkout.customer.email).toBe("billing@example.com");
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.id, checkout.paymentId));
    expect(payment.status).toBe("pending");
    expect(payment.txRef).toBe(checkout.checkout.txRef);

    const applied = await billingSvc.verifyAndApplyPayment({ txRef: payment.txRef },
      { fetchImpl: flwFetch(75000) as never }, db);
    expect(applied).toEqual({ applied: true, status: "successful" });
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, acc.organizationId));
    expect(org.planId).toBe("pro");
    const expiry = org.planExpiresAt!.getTime();
    expect(expiry - Date.now()).toBeGreaterThan(29 * 86_400_000);

    const again = await billingSvc.verifyAndApplyPayment({ txRef: payment.txRef },
      { fetchImpl: flwFetch(75000) as never }, db);
    expect(again.applied).toBe(false);
    const [org2] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, acc.organizationId));
    expect(org2.planExpiresAt!.getTime()).toBe(expiry);

    expect(billingSvc.webhookSecretValid("whsec-test")).toBe(true);
    expect(billingSvc.webhookSecretValid("nope")).toBe(false);
    expect(billingSvc.webhookSecretValid(null)).toBe(false);
  }, 30_000);

  it("amount mismatch never grants", async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-x";
    process.env.FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK_TEST-x";
    const acc = await orgWithPlan("billing-mismatch@example.com", "freemium");
    const headers = new Headers({ "x-vercel-ip-country": "NG" });
    const checkout = await billingSvc.createCheckout(acc.organizationId, acc.userId, "pro", headers,
      { fetchImpl: flwFetch(100) as never, declaredCountry: "NG" }, db);
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.id, checkout.paymentId));
    const result = await billingSvc.verifyAndApplyPayment({ txRef: payment.txRef },
      { fetchImpl: flwFetch(100) as never }, db);
    expect(result.applied).toBe(false);
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, acc.organizationId));
    expect(org.planId).toBe("freemium");
  }, 30_000);

  afterAll(() => {
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    delete process.env.FLUTTERWAVE_PUBLIC_KEY;
    delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  });
});

describe("account deletion", () => {
  it("requires the typed email, then removes a sole-owner account entirely", async () => {
    const acc = await orgWithPlan("delete-me@example.com", "freemium");
    await expect(accountSvc.deleteAccount(acc.userId, "wrong@example.com", db)).rejects.toThrow();
    await accountSvc.deleteAccount(acc.userId, "delete-me@example.com", db);
    const usersLeft = await db.select().from(schema.users).where(eq(schema.users.id, acc.userId));
    const orgsLeft = await db.select().from(schema.organizations).where(eq(schema.organizations.id, acc.organizationId));
    expect(usersLeft).toHaveLength(0);
    expect(orgsLeft).toHaveLength(0);
  }, 30_000);

  it("blocks owners whose workspace still has members", async () => {
    const owner = await orgWithPlan("owner-blocked@example.com", "pro");
    const member = await accounts.registerAccount({ name: "M", email: "member@example.com", password: "a-long-password-123" }, db);
    await db.insert(schema.memberships).values({
      organizationId: owner.organizationId, userId: member.userId, role: "member",
    });
    const info = await accountSvc.accountDeletionInfo(owner.userId, db);
    expect(info.blockingOrgs.length).toBe(1);
    await expect(accountSvc.deleteAccount(owner.userId, "owner-blocked@example.com", db))
      .rejects.toMatchObject({ code: "CONFLICT" });
    // The member deleting their account leaves the workspace intact.
    await accountSvc.deleteAccount(member.userId, "member@example.com", db);
    const orgsLeft = await db.select().from(schema.organizations).where(eq(schema.organizations.id, owner.organizationId));
    expect(orgsLeft).toHaveLength(1);
  }, 30_000);
});
