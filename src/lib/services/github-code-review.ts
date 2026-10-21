import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { githubInstallations, githubRepositories, repoReviews } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import {
  getInstallationInfo,
  getRepoFiles,
  getRepoHeadSha,
  getRepoTree,
  githubAppConfig,
  listInstallationRepos,
  type GithubAppConfig,
} from "@/lib/github-app";
import { analyzeRepository, selectRepoFiles, type RepoReviewReport } from "@/lib/code-review-repo-shared";

/**
 * Code Reviewer bot (GitHub App). A workspace installs the bot on
 * GitHub, registers repos, and runs whole-repo reviews: the bot reads
 * the repo via its installation token, runs the deterministic
 * line-evidence engine over the reviewable files, and saves only
 * findings. Source code is never persisted (same promise as v1).
 *
 * Webhook pushes only mark "new commits seen" (latestSeenSha) — a
 * human pressing Scan is what runs a review, so webhook volume can
 * never run up analysis against anyone's quota unnoticed.
 */

export interface GithubConnectionStatus {
  configured: boolean;
  slug: string | null;
  installation: { id: string; accountLogin: string; accountType: string; createdAt: string } | null;
  repos: RepoView[];
}

export interface RepoView {
  id: string;
  fullName: string;
  defaultBranch: string;
  lastScannedAt: string | null;
  lastScannedSha: string | null;
  latestSeenSha: string | null;
  /** True when GitHub has pushed commits the last scan didn't cover. */
  scanDue: boolean;
  latestReview: { id: string; score: number; counts: { critical: number; high: number; medium: number; low: number }; createdAt: string } | null;
}

const iso = (v: Date | string | null) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

function requireConfig(): GithubAppConfig {
  const config = githubAppConfig();
  if (!config) {
    throw new ScanError(
      "GITHUB_NOT_CONFIGURED",
      "The GitHub bot isn't switched on yet (GITHUB_APP_* settings are missing). The paste reviewer below still works.",
    );
  }
  return config;
}

async function orgInstallation(organizationId: string, db: DB) {
  const [row] = await db.select().from(githubInstallations)
    .where(eq(githubInstallations.organizationId, organizationId)).limit(1);
  return row ?? null;
}

async function latestReviewSummary(repositoryId: string, db: DB) {
  const [row] = await db.select({
    id: repoReviews.id, summary: repoReviews.summary, createdAt: repoReviews.createdAt,
  }).from(repoReviews).where(eq(repoReviews.repositoryId, repositoryId))
    .orderBy(desc(repoReviews.createdAt)).limit(1);
  if (!row) return null;
  const s = row.summary as { score?: number } & Partial<RepoReviewSummaryCounts>;
  return {
    id: row.id,
    score: s.score ?? 0,
    counts: {
      critical: s.critical ?? 0, high: s.high ?? 0, medium: s.medium ?? 0, low: s.low ?? 0,
    },
    createdAt: iso(row.createdAt)!,
  };
}

type RepoReviewSummaryCounts = { critical: number; high: number; medium: number; low: number };

export async function getGithubConnection(organizationId: string, dbOverride?: DB): Promise<GithubConnectionStatus> {
  const db = dbOverride ?? (await getDb());
  const config = githubAppConfig();
  const installation = await orgInstallation(organizationId, db);
  if (!installation) {
    return { configured: !!config, slug: config?.slug ?? null, installation: null, repos: [] };
  }
  const repoRows = await db.select().from(githubRepositories)
    .where(eq(githubRepositories.organizationId, organizationId))
    .orderBy(desc(githubRepositories.createdAt));
  const repos: RepoView[] = [];
  for (const r of repoRows) {
    repos.push({
      id: r.id,
      fullName: r.fullName,
      defaultBranch: r.defaultBranch,
      lastScannedAt: iso(r.lastScannedAt),
      lastScannedSha: r.lastScannedSha,
      latestSeenSha: r.latestSeenSha,
      scanDue: !!r.latestSeenSha && r.latestSeenSha !== r.lastScannedSha,
      latestReview: await latestReviewSummary(r.id, db),
    });
  }
  return {
    configured: !!config,
    slug: config?.slug ?? null,
    installation: {
      id: installation.id,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      createdAt: iso(installation.createdAt)!,
    },
    repos,
  };
}

/** Claim an installation for this workspace after GitHub redirects back with its id. */
export async function claimInstallation(
  organizationId: string, userId: string, installationIdRaw: string, dbOverride?: DB,
): Promise<void> {
  const config = requireConfig();
  const db = dbOverride ?? (await getDb());
  const installationId = String(installationIdRaw ?? "").trim();
  if (!/^\d{1,20}$/.test(installationId)) throw new ScanError("VALIDATION", "That installation reference doesn't look right.");
  const info = await getInstallationInfo(config, installationId);
  const existing = await db.select().from(githubInstallations)
    .where(eq(githubInstallations.installationId, installationId)).limit(1);
  if (existing.length && existing[0].organizationId !== organizationId) {
    throw new ScanError("CONFLICT", "That GitHub installation is already connected to another workspace.");
  }
  if (existing.length) return; // already claimed by this workspace — idempotent
  const mine = await orgInstallation(organizationId, db);
  if (mine) {
    throw new ScanError("CONFLICT", "This workspace already has a GitHub installation connected. Disconnect it first to switch accounts.");
  }
  await db.insert(githubInstallations).values({
    id: newId(), organizationId, installedBy: userId,
    installationId, accountLogin: info.accountLogin, accountType: info.accountType,
  });
}

export async function disconnectInstallation(organizationId: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  await db.delete(githubInstallations).where(eq(githubInstallations.organizationId, organizationId));
}

/** Repos the bot can see on GitHub for this workspace's installation (for the Add list). */
export async function listAvailableRepos(organizationId: string, dbOverride?: DB) {
  const config = requireConfig();
  const db = dbOverride ?? (await getDb());
  const installation = await orgInstallation(organizationId, db);
  if (!installation) throw new ScanError("NOT_FOUND", "No GitHub installation is connected to this workspace yet.");
  const available = await listInstallationRepos(config, installation.installationId);
  const registered = new Set(
    (await db.select({ fullName: githubRepositories.fullName }).from(githubRepositories)
      .where(eq(githubRepositories.organizationId, organizationId))).map((r) => r.fullName),
  );
  return available.map((r) => ({ ...r, registered: registered.has(r.fullName) }));
}

export async function registerRepo(
  organizationId: string, userId: string, fullNameRaw: string, dbOverride?: DB,
): Promise<void> {
  const config = requireConfig();
  const db = dbOverride ?? (await getDb());
  void userId;
  const fullName = String(fullNameRaw ?? "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) throw new ScanError("VALIDATION", "Repository must look like owner/name.");
  const installation = await orgInstallation(organizationId, db);
  if (!installation) throw new ScanError("NOT_FOUND", "No GitHub installation is connected to this workspace yet.");
  // Only repos the bot can actually access may be registered — no typing arbitrary repos.
  const available = await listInstallationRepos(config, installation.installationId);
  const match = available.find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
  if (!match) {
    throw new ScanError("VALIDATION", "The Clyvro bot can't see that repository. Install (or extend) the bot on GitHub for it first.");
  }
  await db.insert(githubRepositories).values({
    id: newId(), organizationId, installationId: installation.id,
    fullName: match.fullName, defaultBranch: match.defaultBranch,
  }).onConflictDoNothing();
}

/** Run a whole-repo review now. Bounded + synchronous by design (see caps in code-review-repo-shared). */
export async function runRepoReview(
  organizationId: string, userId: string, repositoryId: string, dbOverride?: DB, fetchFn: typeof fetch = fetch,
): Promise<{ id: string; report: RepoReviewReport }> {
  const config = requireConfig();
  const db = dbOverride ?? (await getDb());
  const [repo] = await db.select().from(githubRepositories)
    .where(and(eq(githubRepositories.id, repositoryId), eq(githubRepositories.organizationId, organizationId))).limit(1);
  if (!repo) throw new ScanError("NOT_FOUND", "That repository isn't registered in this workspace.");
  const [installation] = await db.select().from(githubInstallations)
    .where(eq(githubInstallations.id, repo.installationId)).limit(1);
  if (!installation) throw new ScanError("NOT_FOUND", "The GitHub installation for that repository is no longer connected.");

  const tree = await getRepoTree(config, installation.installationId, repo.fullName, repo.defaultBranch, fetchFn);
  const { selected, skipped } = selectRepoFiles(tree.tree);
  if (!selected.length) {
    throw new ScanError("VALIDATION", "No reviewable files were found in that repository (code files under the size caps). Nothing was scanned.");
  }
  const files = await getRepoFiles(config, installation.installationId, repo.fullName, selected.map((s) => s.path), repo.defaultBranch, fetchFn);
  if (!files.length) {
    throw new ScanError("VALIDATION", "The bot could read the repository tree but no file contents came back. Nothing was scanned.");
  }
  const report = analyzeRepository(files, skipped);
  const headSha = (await getRepoHeadSha(config, installation.installationId, repo.fullName, repo.defaultBranch, fetchFn).catch(() => null)) ?? tree.sha;
  const id = newId();
  const summary = {
    score: report.score, ...report.counts,
    filesScanned: report.filesScanned, truncated: report.truncated,
  };
  await db.insert(repoReviews).values({
    id, organizationId, repositoryId: repo.id, requestedBy: userId,
    trigger: "manual", commitSha: headSha, results: report, summary,
  });
  await db.update(githubRepositories)
    .set({ lastScannedSha: headSha, latestSeenSha: headSha, lastScannedAt: new Date() })
    .where(eq(githubRepositories.id, repo.id));
  return { id, report };
}

export async function getRepoReview(organizationId: string, reviewId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select({
    review: repoReviews, fullName: githubRepositories.fullName,
  }).from(repoReviews)
    .innerJoin(githubRepositories, eq(githubRepositories.id, repoReviews.repositoryId))
    .where(and(eq(repoReviews.id, reviewId), eq(repoReviews.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "That review doesn't exist in this workspace.");
  return {
    id: row.review.id,
    fullName: row.fullName,
    commitSha: row.review.commitSha,
    trigger: row.review.trigger,
    createdAt: iso(row.review.createdAt)!,
    report: row.review.results as RepoReviewReport,
  };
}

/**
 * Webhook bookkeeping. Signature is verified by the route before this
 * runs. Never scans — just records what GitHub told us:
 * - installation deleted → drop the link (repos/reviews cascade).
 * - push to a registered repo's default branch → mark latest seen sha.
 */
export async function handleGithubWebhook(event: string, payload: Record<string, unknown>, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  if (event === "installation" && (payload.action === "deleted")) {
    const installationId = String((payload.installation as { id?: number } | undefined)?.id ?? "");
    if (installationId) {
      await db.delete(githubInstallations).where(eq(githubInstallations.installationId, installationId));
    }
    return;
  }
  if (event === "push") {
    const fullName = (payload.repository as { full_name?: string } | undefined)?.full_name;
    const ref = typeof payload.ref === "string" ? payload.ref : "";
    const after = typeof payload.after === "string" ? payload.after : null;
    const installationId = String((payload.installation as { id?: number } | undefined)?.id ?? "");
    if (!fullName || !after || !installationId) return;
    const [installation] = await db.select().from(githubInstallations)
      .where(eq(githubInstallations.installationId, installationId)).limit(1);
    if (!installation) return;
    const [repo] = await db.select().from(githubRepositories)
      .where(and(eq(githubRepositories.installationId, installation.id), eq(githubRepositories.fullName, fullName))).limit(1);
    if (!repo) return;
    if (ref !== `refs/heads/${repo.defaultBranch}`) return; // only the default branch drives scan-due
    await db.update(githubRepositories)
      .set({ latestSeenSha: after })
      .where(eq(githubRepositories.id, repo.id));
  }
}
