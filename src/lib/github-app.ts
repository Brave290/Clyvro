import { createHmac, createSign, timingSafeEqual } from "node:crypto";

/**
 * GitHub App plumbing for the Code Reviewer bot (server-only).
 *
 * Founder-configured via env (see .env.example):
 *   GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM, "\n"-escaped ok),
 *   GITHUB_APP_SLUG (install URL), GITHUB_APP_WEBHOOK_SECRET.
 * When unconfigured, `githubAppConfigured()` is false and the product
 * says so honestly instead of showing a dead install button.
 *
 * All network calls go through an injectable fetch so tests can run
 * the full flow (JWT → installation token → repo listing → file read)
 * against a fake GitHub without touching the network.
 */

export interface GithubAppConfig {
  appId: string;
  privateKey: string;
  slug: string;
  webhookSecret: string;
}

export function githubAppConfig(): GithubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!appId || !privateKeyRaw || !slug || !webhookSecret) return null;
  return {
    appId,
    privateKey: privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw,
    slug,
    webhookSecret,
  };
}

export function githubAppConfigured(): boolean {
  return githubAppConfig() !== null;
}

export function githubInstallUrl(slug: string): string {
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** RS256 App JWT (GitHub requires iss=App ID, ≤10 min lifetime). */
export function createAppJwt(appId: string, privateKeyPem: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = base64url(signer.sign(privateKeyPem));
  return `${header}.${payload}.${signature}`;
}

/** Constant-time check of GitHub's `x-hub-signature-256` webhook header. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = signatureHeader.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

type FetchFn = typeof fetch;

const tokenCache = new Map<string, { token: string; expiresAtMs: number }>();

async function githubFetch(fetchFn: FetchFn, path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetchFn(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ClyvroCodeReviewer/1.0",
      ...(init?.headers ?? {}),
    },
  });
}

export async function getInstallationToken(
  config: GithubAppConfig, installationId: string, fetchFn: FetchFn = fetch,
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) return cached.token;
  const jwt = createAppJwt(config.appId, config.privateKey);
  const res = await githubFetch(fetchFn, `/app/installations/${installationId}/access_tokens`, jwt, { method: "POST" });
  if (!res.ok) throw new Error(`GitHub installation token request failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, { token: json.token, expiresAtMs: Date.parse(json.expires_at) || Date.now() + 3_000_000 });
  return json.token;
}

export interface GithubInstallationInfo {
  id: number;
  accountLogin: string;
  accountType: string;
}

export async function getInstallationInfo(
  config: GithubAppConfig, installationId: string, fetchFn: FetchFn = fetch,
): Promise<GithubInstallationInfo> {
  const jwt = createAppJwt(config.appId, config.privateKey);
  const res = await githubFetch(fetchFn, `/app/installations/${installationId}`, jwt);
  if (!res.ok) throw new Error(`GitHub installation lookup failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { id: number; account?: { login?: string; type?: string } };
  return {
    id: json.id,
    accountLogin: json.account?.login ?? "unknown",
    accountType: json.account?.type ?? "User",
  };
}

export interface GithubRepoSummary {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export async function listInstallationRepos(
  config: GithubAppConfig, installationId: string, fetchFn: FetchFn = fetch,
): Promise<GithubRepoSummary[]> {
  const token = await getInstallationToken(config, installationId, fetchFn);
  const repos: GithubRepoSummary[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await githubFetch(fetchFn, `/installation/repositories?per_page=100&page=${page}`, token);
    if (!res.ok) throw new Error(`GitHub repository listing failed (HTTP ${res.status}).`);
    const json = (await res.json()) as { repositories?: { full_name: string; default_branch: string; private: boolean }[] };
    const batch = json.repositories ?? [];
    for (const r of batch) repos.push({ fullName: r.full_name, defaultBranch: r.default_branch, private: r.private });
    if (batch.length < 100) break;
  }
  return repos;
}

export interface RepoTreeResult {
  sha: string;
  tree: { path: string; type: string; size?: number }[];
  truncated: boolean;
}

export async function getRepoTree(
  config: GithubAppConfig, installationId: string, fullName: string, branch: string, fetchFn: FetchFn = fetch,
): Promise<RepoTreeResult> {
  const token = await getInstallationToken(config, installationId, fetchFn);
  const res = await githubFetch(fetchFn, `/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  if (!res.ok) throw new Error(`GitHub tree read failed for ${fullName} (HTTP ${res.status}).`);
  const json = (await res.json()) as { sha: string; tree: RepoTreeResult["tree"]; truncated?: boolean };
  return { sha: json.sha, tree: json.tree ?? [], truncated: !!json.truncated };
}

export async function getRepoHeadSha(
  config: GithubAppConfig, installationId: string, fullName: string, branch: string, fetchFn: FetchFn = fetch,
): Promise<string | null> {
  const token = await getInstallationToken(config, installationId, fetchFn);
  const res = await githubFetch(fetchFn, `/repos/${fullName}/git/refs/heads/${encodeURIComponent(branch)}`, token);
  if (!res.ok) return null;
  const json = (await res.json()) as { object?: { sha?: string } };
  return json.object?.sha ?? null;
}

export async function getFileText(
  config: GithubAppConfig, installationId: string, fullName: string, path: string, ref: string, fetchFn: FetchFn = fetch,
): Promise<string | null> {
  const token = await getInstallationToken(config, installationId, fetchFn);
  const res = await githubFetch(
    fetchFn,
    `/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { content?: string; encoding?: string };
  if (!json.content || json.encoding !== "base64") return null;
  const text = Buffer.from(json.content.replace(/\n/g, ""), "base64").toString("utf8");
  // Binary guard: NUL bytes mean this isn't text whatever the extension said.
  if (text.includes("\u0000")) return null;
  return text;
}

/** Fetch many files with bounded concurrency; missing/binary files are dropped. */
export async function getRepoFiles(
  config: GithubAppConfig, installationId: string, fullName: string,
  paths: string[], ref: string, fetchFn: FetchFn = fetch, concurrency = 6,
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      const content = await getFileText(config, installationId, fullName, path, ref, fetchFn).catch(() => null);
      if (content !== null) out.push({ path, content });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length || 1) }, () => worker()));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
