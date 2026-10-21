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
  });
});
