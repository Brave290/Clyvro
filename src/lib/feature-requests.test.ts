process.env.CLYVRO_DB_MEMORY = "1";

import { describe, expect, it } from "vitest";

describe("feature requests board", () => {
  it("submits, auto-upvotes, toggles votes, sorts by votes, and gates status to admins", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const fr = await import("@/lib/services/feature-requests");

    const a = await accounts.registerAccount(
      { name: "A", email: "fr-a@example.com", password: "a-long-password-123" }, db);
    const b = await accounts.registerAccount(
      { name: "B", email: "fr-b@example.com", password: "a-long-password-123" }, db);

    const created = await fr.createFeatureRequest(a.organizationId, a.userId,
      { title: "Email me on new critical findings", details: "Scheduled scans should alert me.", category: "scanner" }, db);
    expect(created.votes).toBe(1);
    expect(created.votedByMe).toBe(true);
    expect(created.status).toBe("requested");

    // Validation is real: too-short titles are refused.
    await expect(fr.createFeatureRequest(a.organizationId, a.userId, { title: "x" }, db))
      .rejects.toThrow(/at least 4 characters/);

    // Another workspace can upvote; the board anonymises them.
    const toggle1 = await fr.toggleFeatureVote(b.organizationId, b.userId, created.id, db);
    expect(toggle1).toEqual({ votes: 2, votedByMe: true });
    const boardForA = await fr.listFeatureRequests(a.organizationId, a.userId, db);
    expect(boardForA[0].votes).toBe(2);
    expect(boardForA[0].authorLabel).toBe("Your workspace");
    const boardForB = await fr.listFeatureRequests(b.organizationId, b.userId, db);
    expect(boardForB[0].authorLabel).toBe("Another workspace");
    expect(boardForB[0].votedByMe).toBe(true);

    // Toggling again removes the vote.
    expect(await fr.toggleFeatureVote(b.organizationId, b.userId, created.id, db))
      .toEqual({ votes: 1, votedByMe: false });

    // Status changes are platform-admin only (a normal user is refused).
    await expect(fr.setFeatureStatus(a.userId, created.id, "planned", db))
      .rejects.toThrow(/Administrator access required/);

    // An admin (env-provisioned owner email) can move it through the lifecycle.
    const owner = await accounts.registerAccount(
      { name: "Owner", email: "legateakanjimusab@gmail.com", password: "a-long-password-123" }, db);
    await fr.setFeatureStatus(owner.userId, created.id, "planned", db);
    const after = await fr.listFeatureRequests(a.organizationId, a.userId, db);
    expect(after[0].status).toBe("planned");
  });

  it("delete-my-upvote removes only the caller's vote, and deleting again is a no-op", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const fr = await import("@/lib/services/feature-requests");

    const a = await accounts.registerAccount(
      { name: "A", email: "fr-del-a@example.com", password: "a-long-password-123" }, db);
    const b = await accounts.registerAccount(
      { name: "B", email: "fr-del-b@example.com", password: "a-long-password-123" }, db);

    const created = await fr.createFeatureRequest(a.organizationId, a.userId,
      { title: "Weekly PDF digest for clients", details: "", category: "reports" }, db);
    // B upvotes too → 2 votes (A's auto-vote + B's).
    expect(await fr.toggleFeatureVote(b.organizationId, b.userId, created.id, db))
      .toEqual({ votes: 2, votedByMe: true });

    // B deletes their own upvote: only B's vote goes away.
    expect(await fr.removeFeatureVote(b.organizationId, b.userId, created.id, db))
      .toEqual({ votes: 1, votedByMe: false });
    const boardForA = await fr.listFeatureRequests(a.organizationId, a.userId, db);
    expect(boardForA[0].votes).toBe(1);
    expect(boardForA[0].votedByMe).toBe(true); // A's own vote untouched

    // Deleting again (no vote of B's exists) changes nothing and still succeeds.
    expect(await fr.removeFeatureVote(b.organizationId, b.userId, created.id, db))
      .toEqual({ votes: 1, votedByMe: false });

    // A non-existent request is a clean NOT_FOUND.
    await expect(fr.removeFeatureVote(b.organizationId, b.userId, "no-such-request", db))
      .rejects.toThrow(/no longer exists/);
  });

  it("admin board view: votes counted, workspaces named, non-admins refused", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const fr = await import("@/lib/services/feature-requests");

    const a = await accounts.registerAccount(
      { name: "A", email: "fra-a@example.com", password: "a-long-password-123" }, db);
    const b = await accounts.registerAccount(
      { name: "B", email: "fra-b@example.com", password: "a-long-password-123" }, db);
    const owner = await accounts.registerAccount(
      { name: "Owner", email: "legateakanjimusab@gmail.com", password: "a-long-password-123" }, db);

    const low = await fr.createFeatureRequest(a.organizationId, a.userId,
      { title: "Dark mode for reports", category: "reports" }, db);
    const high = await fr.createFeatureRequest(b.organizationId, b.userId,
      { title: "Slack alerts for failed scans", category: "integrations" }, db);
    await fr.toggleFeatureVote(a.organizationId, a.userId, high.id, db);
    void low;

    // A regular user is refused the admin view.
    await expect(fr.listFeatureRequestsForAdmin(a.userId, db))
      .rejects.toThrow(/Administrator access required/);

    const board = await fr.listFeatureRequestsForAdmin(owner.userId, db);
    expect(board).toHaveLength(2);
    // Ranked by votes: the 2-vote request first, with its workspace named.
    expect(board[0].title).toBe("Slack alerts for failed scans");
    expect(board[0].votes).toBe(2);
    expect(board[0].workspaceName.length).toBeGreaterThan(0);
    expect(board[1].votes).toBe(1);

    // Public roadmap: same ranking, no identity fields at all.
    const pub = await fr.listFeatureRequestsPublic(db);
    expect(pub.map((r) => r.title)).toEqual(["Slack alerts for failed scans", "Dark mode for reports"]);
    expect(pub[0].votes).toBe(2);
    expect(pub[0]).not.toHaveProperty("workspaceName");
    expect(pub[0]).not.toHaveProperty("authorLabel");
  });
});

describe("delete my feature request completely", () => {
  it("only the author can delete it; the request and all its votes disappear", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const fr = await import("@/lib/services/feature-requests");
    const { featureRequestVotes } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const a = await accounts.registerAccount(
      { name: "A", email: "fr-delreq-a@example.com", password: "a-long-password-123" }, db);
    const b = await accounts.registerAccount(
      { name: "B", email: "fr-delreq-b@example.com", password: "a-long-password-123" }, db);

    const created = await fr.createFeatureRequest(a.organizationId, a.userId,
      { title: "Export reports to Notion", details: "", category: "integrations" }, db);
    expect(created.canDelete).toBe(true);
    await fr.toggleFeatureVote(b.organizationId, b.userId, created.id, db);

    // The board flags delete rights for the author only.
    const boardForA = await fr.listFeatureRequests(a.organizationId, a.userId, db);
    expect(boardForA[0].canDelete).toBe(true);
    const boardForB = await fr.listFeatureRequests(b.organizationId, b.userId, db);
    expect(boardForB[0].canDelete).toBe(false);

    // A non-author (even a voter) is refused and the request survives.
    await expect(fr.deleteOwnFeatureRequest(b.userId, created.id, db))
      .rejects.toThrow(/Only the person who suggested this/);
    expect(await fr.listFeatureRequests(a.organizationId, a.userId, db)).toHaveLength(1);

    // The author deletes it completely: request gone, votes gone with it.
    await fr.deleteOwnFeatureRequest(a.userId, created.id, db);
    expect(await fr.listFeatureRequests(a.organizationId, a.userId, db)).toHaveLength(0);
    const votes = await db.select().from(featureRequestVotes)
      .where(eq(featureRequestVotes.requestId, created.id));
    expect(votes).toHaveLength(0);

    // Deleting a missing request is a clean NOT_FOUND.
    await expect(fr.deleteOwnFeatureRequest(a.userId, created.id, db))
      .rejects.toThrow(/no longer exists/);
    await expect(fr.deleteOwnFeatureRequest(a.userId, "no-such-request", db))
      .rejects.toThrow(/no longer exists/);
  });
});

describe("roadmap growth loop", () => {
  it("shipping a request notifies every voter exactly once; top-this-month ranks fresh requests", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const accounts = await import("@/lib/services/accounts");
    const fr = await import("@/lib/services/feature-requests");
    const { notificationOutbox } = await import("@/lib/db/schema");

    const a = await accounts.registerAccount(
      { name: "A", email: "loop-a@example.com", password: "a-long-password-123" }, db);
    const b = await accounts.registerAccount(
      { name: "B", email: "loop-b@example.com", password: "a-long-password-123" }, db);
    const owner = await accounts.registerAccount(
      { name: "Owner", email: "legateakanjimusab@gmail.com", password: "a-long-password-123" }, db);

    const created = await fr.createFeatureRequest(a.organizationId, a.userId,
      { title: "Weekly digest email of scan changes", details: "Summarise what changed week to week.", category: "reports" }, db);
    await fr.toggleFeatureVote(b.organizationId, b.userId, created.id, db);

    // planned → no nudge yet
    await fr.setFeatureStatus(owner.userId, created.id, "planned", db);
    let rows = await db.select().from(notificationOutbox);
    expect(rows).toHaveLength(0);

    // shipped → both voters (author auto-vote + b) get one outbox row each
    await fr.setFeatureStatus(owner.userId, created.id, "shipped", db);
    rows = await db.select().from(notificationOutbox);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "feature_shipped")).toBe(true);

    // shipped again (already shipped) → no duplicates
    await fr.setFeatureStatus(owner.userId, created.id, "shipped", db);
    rows = await db.select().from(notificationOutbox);
    expect(rows).toHaveLength(2);

    const hot = await fr.topRequestedThisMonth(db);
    expect(hot[0]).toMatchObject({ id: created.id, votes: 2 });
  });
});

describe("vote bot guards", () => {
  it("tryConsumeUserAction allows up to the window limit, then refuses, per user", async () => {
    const db = await (await import("@/lib/db")).createDb();
    const abuse = await import("@/lib/services/abuse");
    const accounts = await import("@/lib/services/accounts");
    const u = await accounts.registerAccount(
      { name: "Bot", email: "bot-guard@example.com", password: "a-long-password-123" }, db);
    for (let i = 0; i < 3; i++) {
      expect(await abuse.tryConsumeUserAction("feature-vote", u.userId, 3, 60_000, db)).toBe(true);
    }
    expect(await abuse.tryConsumeUserAction("feature-vote", u.userId, 3, 60_000, db)).toBe(false);
    // A different user is unaffected.
    const v = await accounts.registerAccount(
      { name: "Human", email: "human-guard@example.com", password: "a-long-password-123" }, db);
    expect(await abuse.tryConsumeUserAction("feature-vote", v.userId, 3, 60_000, db)).toBe(true);
  });
});
