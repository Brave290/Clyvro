process.env.CLYVRO_DB_MEMORY = "1";

import { createVerify, generateKeyPairSync, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAppJwt, verifyWebhookSignature } from "@/lib/github-app";
import { analyzeRepository, selectRepoFiles } from "@/lib/code-review-repo-shared";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

describe("github app auth primitives", () => {
  it("creates an RS256 App JWT GitHub would accept (iss=App ID, ≤10min)", () => {
    const jwt = createAppJwt("424242", privatePem, 1_700_000_000);
    const [h, p, sig] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${h}.${p}`);
    verifier.end();
    expect(verifier.verify(publicPem, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"))).toBe(true);
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    expect(payload.iss).toBe("424242");
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
  });

  it("verifies webhook HMAC signatures and rejects tampering", () => {
    const body = JSON.stringify({ action: "created" });
    const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyWebhookSignature(body, sig, "wrong-secret")).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sig, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, null, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", "s3cret")).toBe(false);
  });
});

describe("repo file selection + analysis", () => {
  it("selects reviewable code, skips vendor/lock/binary/oversized, respects caps", () => {
    const { selected, skipped } = selectRepoFiles([
      { path: "src/app.js", type: "blob", size: 500 },
      { path: "node_modules/left-pad/index.js", type: "blob", size: 100 },
      { path: "package-lock.json", type: "blob", size: 5000 },
      { path: "logo.png", type: "blob", size: 900 },
      { path: "src/huge.ts", type: "blob", size: 500_000 },
      { path: "lib/util.py", type: "blob", size: 300 },
      { path: "src", type: "tree" },
      { path: "README.md", type: "blob", size: 200 },
    ]);
    expect(selected.map((s) => s.path)).toEqual(["lib/util.py", "src/app.js"]);
    expect(skipped).toBe(5);
  });

  it("runs the line-evidence engine per file; findings carry file paths", () => {
    const report = analyzeRepository([
      { path: "src/clean.js", content: "export const x = 1;\n" },
      { path: "src/bad.js", content: "const q = \"SELECT * FROM users WHERE id = \" + req.query.id;\ndb.query(q);\n" },
    ]);
    expect(report.filesScanned).toBe(2);
    expect(report.filesWithFindings).toBe(1);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.file === "src/bad.js")).toBe(true);
    expect(report.counts.high + report.counts.critical).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
  });
});

describe("github code review service (fake GitHub, in-memory DB)", () => {
  it("claims an installation, registers a repo, scans it, and marks scan-due on push", async () => {
    process.env.GITHUB_APP_ID = "424242";
    process.env.GITHUB_APP_PRIVATE_KEY = privatePem;
    process.env.GITHUB_APP_SLUG = "clyvro-reviewer";
    process.env.GITHUB_APP_WEBHOOK_SECRET = "whsec-test";

    const badCode = "const apiKey = \"sk-live-9f27ab41c0d84e12\";\napp.get('/u', (req, res) => { db.query(\"SELECT * FROM users WHERE id = \" + req.query.id); });\n";
    const fakeFetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/access_tokens")) return json({ token: "tok", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      if (url.endsWith("/app/installations/123")) return json({ id: 123, account: { login: "acme", type: "Organization" } });
      if (url.includes("/installation/repositories")) {
        return json({ repositories: [{ full_name: "acme/site", default_branch: "main", private: false }] });
      }
      if (url.includes("/git/trees/main")) {
        return json({
          sha: "aaa111",
          tree: [
            { path: "src/app.js", type: "blob", size: badCode.length },
            { path: "node_modules/x/index.js", type: "blob", size: 10 },
            { path: "logo.png", type: "blob", size: 10 },
          ],
        });
      }
      if (url.includes("/contents/src/app.js")) {
        return json({ content: Buffer.from(badCode).toString("base64"), encoding: "base64" });
      }
      if (url.includes("/git/refs/heads/main")) return json({ object: { sha: "aaa111" } });
      return json({ message: "unexpected" }, 404);
    });
    vi.stubGlobal("fetch", fakeFetch);

    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const gh = await import("@/lib/services/github-code-review");
    const a = await accounts.registerAccount(
      { name: "A", email: "gh-a@example.com", password: "a-long-password-123" }, db);

    // Unconfigured workspaces can't appear: config is set, but nothing claimed yet.
    let status = await gh.getGithubConnection(a.organizationId, db);
    expect(status.configured).toBe(true);
    expect(status.installation).toBeNull();

    await gh.claimInstallation(a.organizationId, a.userId, "123", db);
    // Idempotent second claim.
    await gh.claimInstallation(a.organizationId, a.userId, "123", db);

    const available = await gh.listAvailableRepos(a.organizationId, db);
    expect(available).toHaveLength(1);
    expect(available[0].registered).toBe(false);

    await gh.registerRepo(a.organizationId, a.userId, "acme/site", db);
    status = await gh.getGithubConnection(a.organizationId, db);
    expect(status.installation?.accountLogin).toBe("acme");
    expect(status.repos).toHaveLength(1);
    const repoId = status.repos[0].id;

    // Registering a repo the bot can't see is refused.
    await expect(gh.registerRepo(a.organizationId, a.userId, "someone/else", db))
      .rejects.toThrow(/can't see that repository/);

    const { id: reviewId, report } = await gh.runRepoReview(a.organizationId, a.userId, repoId, db);
    expect(report.filesScanned).toBe(1); // node_modules + png skipped
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.file === "src/app.js")).toBe(true);

    const detail = await gh.getRepoReview(a.organizationId, reviewId, db);
    expect(detail.fullName).toBe("acme/site");
    expect(detail.commitSha).toBe("aaa111");

    status = await gh.getGithubConnection(a.organizationId, db);
    expect(status.repos[0].scanDue).toBe(false);
    expect(status.repos[0].latestReview?.id).toBe(reviewId);

    // A push to the default branch marks the repo scan-due (no auto-scan).
    await gh.handleGithubWebhook("push", {
      ref: "refs/heads/main", after: "bbb222",
      repository: { full_name: "acme/site" }, installation: { id: 123 },
    }, db);
    status = await gh.getGithubConnection(a.organizationId, db);
    expect(status.repos[0].scanDue).toBe(true);
    expect(status.repos[0].latestSeenSha).toBe("bbb222");

    // Pushes to other branches don't mark scan-due.
    await gh.handleGithubWebhook("push", {
      ref: "refs/heads/dev", after: "ccc333",
      repository: { full_name: "acme/site" }, installation: { id: 123 },
    }, db);
    status = await gh.getGithubConnection(a.organizationId, db);
    expect(status.repos[0].latestSeenSha).toBe("bbb222");

    vi.unstubAllGlobals();
  });
});
