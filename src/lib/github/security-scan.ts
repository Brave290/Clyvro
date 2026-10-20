/**
 * Deterministic, source-only security checks for repository files.
 *
 * This module deliberately does not perform network I/O. An advisory lookup is
 * injected by the caller and receives only npm package names and versions; no
 * repository file contents are ever passed to it.
 */

export type SecuritySeverity = "low" | "medium" | "high" | "critical";
export type AdvisoryAvailability = "not-configured" | "complete" | "partial" | "unavailable";

export interface RepositoryFile {
  path: string;
  content: string;
}

export interface AdvisoryQuery {
  package: {
    ecosystem: "npm";
    name: string;
  };
  version: string;
}

export interface OsvAdvisory {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: readonly string[];
  severity?: readonly { type?: string; score?: string }[];
  database_specific?: { severity?: string };
}

export interface OsvBatchResult {
  vulns?: readonly OsvAdvisory[] | null;
}

export interface OsvBatchResponse {
  results?: readonly OsvBatchResult[];
}

export type AdvisoryLookupResult = OsvBatchResponse | readonly OsvBatchResult[];
export type AdvisoryLookup = (queries: readonly AdvisoryQuery[]) => AdvisoryLookupResult | Promise<AdvisoryLookupResult>;

export interface SecurityFinding {
  rule: string;
  path: string;
  line?: number;
  package?: string;
  advisoryId?: string;
  evidence: string[];
  severity: SecuritySeverity;
  recommendation: string;
  confidenceBasis: string;
}

export interface SecurityScanLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxPackages: number;
  advisoryBatchSize: number;
}

export interface SecurityScanOptions {
  advisoryLookup?: AdvisoryLookup;
  limits?: Partial<SecurityScanLimits>;
}

export interface SecurityScanCoverage {
  filesInspected: number;
  filesSkipped: number;
  packagesInspected: number;
  advisoryQueries: number;
  advisoryBatches: number;
  advisoryAvailability: AdvisoryAvailability;
  limitations: string[];
}

export interface SecurityScanReport {
  findings: SecurityFinding[];
  coverage: SecurityScanCoverage;
  /** A convenient top-level alias for callers presenting scan caveats. */
  limitations: string[];
}

export const DEFAULT_SECURITY_SCAN_LIMITS: SecurityScanLimits = {
  maxFiles: 500,
  maxFileBytes: 1_000_000,
  maxPackages: 500,
  advisoryBatchSize: 100,
};

const SECRET_RULES = [
  {
    name: "private-key-block",
    regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
    severity: "critical" as const,
    summary: "A private-key PEM header was found (matching key material redacted).",
    recommendation: "Revoke or rotate the key, remove it from repository history, and use a secret manager or injected runtime credential.",
  },
  {
    name: "github-token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    severity: "high" as const,
    summary: "A GitHub token-shaped value was found (matching token redacted).",
    recommendation: "Revoke the token, remove it from repository history, and use a short-lived or injected credential.",
  },
  {
    name: "aws-access-key-id",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    severity: "high" as const,
    summary: "An AWS access-key identifier-shaped value was found (matching identifier redacted).",
    recommendation: "Deactivate and rotate the associated AWS credential, then use an injected role or secret manager.",
  },
  {
    name: "slack-token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    severity: "high" as const,
    summary: "A Slack token-shaped value was found (matching token redacted).",
    recommendation: "Revoke the token and move the replacement into a secret manager or runtime environment.",
  },
  {
    name: "stripe-live-key",
    regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
    severity: "critical" as const,
    summary: "A Stripe live-key-shaped value was found (matching key redacted).",
    recommendation: "Immediately rotate the live key, remove it from history, and inject it only at runtime.",
  },
] as const;

const ASSIGNMENT_RULE = {
  name: "credential-like-assignment",
  // Capture groups are used only during this call and are never retained in a finding.
  regex: /\b(api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password)\b\s*[:=]\s*(["'])([^"'\r\n]{16,})\2/i,
  severity: "high" as const,
  recommendation: "Remove the credential from source and history, rotate it if it was usable, and inject it through a secret manager or runtime environment.",
};

const PLACEHOLDER = /^(?:example|sample|test|dummy|fake|placeholder|changeme|change[-_ ]?me|your[-_ ]?(?:key|token|secret|password)|replace[-_ ]?me|redacted|xxx+|\*+)[\w .:/-]*$/i;

function normalizedLimits(input?: Partial<SecurityScanLimits>): SecurityScanLimits {
  const candidate = { ...DEFAULT_SECURITY_SCAN_LIMITS, ...(input ?? {}) };
  return {
    maxFiles: positiveInteger(candidate.maxFiles, DEFAULT_SECURITY_SCAN_LIMITS.maxFiles),
    maxFileBytes: positiveInteger(candidate.maxFileBytes, DEFAULT_SECURITY_SCAN_LIMITS.maxFileBytes),
    maxPackages: positiveInteger(candidate.maxPackages, DEFAULT_SECURITY_SCAN_LIMITS.maxPackages),
    advisoryBatchSize: positiveInteger(candidate.advisoryBatchSize, DEFAULT_SECURITY_SCAN_LIMITS.advisoryBatchSize),
  };
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function sortedFiles(files: readonly RepositoryFile[]): RepositoryFile[] {
  return [...files]
    .map((file) => ({ path: safePath(file.path), content: file.content }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.content.localeCompare(b.content));
}

function lineNumber(content: string, index: number): number {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) if (content.charCodeAt(offset) === 10) line += 1;
  return line;
}

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length < 16 || PLACEHOLDER.test(trimmed) || /\$\{[^}]+\}|<[^>]+>|process\.env\b|^null$|^undefined$/i.test(trimmed);
}

function secretFindings(file: RepositoryFile): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = file.content.split("\n");

  lines.forEach((line, index) => {
    const matchingSpecificRules = SECRET_RULES.filter((rule) => rule.regex.test(line));
    for (const rule of matchingSpecificRules) {
      findings.push({
        rule: rule.name,
        path: file.path,
        line: index + 1,
        evidence: [rule.summary],
        severity: rule.severity,
        recommendation: rule.recommendation,
        confidenceBasis: "heuristic: conservative token format matched; the matching value is intentionally redacted",
      });
    }

    // Avoid reporting a lower-specificity assignment finding for the same line
    // when a provider-specific format already established the likely credential.
    if (matchingSpecificRules.length === 0) {
      const assignment = ASSIGNMENT_RULE.regex.exec(line);
      if (assignment && !isPlaceholder(assignment[3])) {
        const keyName = assignment[1].toLowerCase();
        findings.push({
          rule: ASSIGNMENT_RULE.name,
          path: file.path,
          line: index + 1,
          evidence: [`Credential-like value assigned to ${keyName} (value redacted; length ${assignment[3].length}).`],
          severity: ASSIGNMENT_RULE.severity,
          recommendation: ASSIGNMENT_RULE.recommendation,
          confidenceBasis: "heuristic: sensitive-name assignment with a non-placeholder value; the matching value is intentionally redacted",
        });
      }
    }
  });
  return findings;
}

function packageNameFromEntry(entryPath: string): string | null {
  const marker = "/node_modules/";
  const markerIndex = entryPath.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const packagePath = entryPath.slice(markerIndex + marker.length);
  const parts = packagePath.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0].startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

interface LockedPackage {
  name: string;
  version: string;
  path: string;
}

function packagesFromLockfile(file: RepositoryFile, limitations: string[]): LockedPackage[] {
  if (file.path.split("/").pop() !== "package-lock.json") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    limitations.push(`${file.path}: package-lock.json is not valid JSON; dependency advisories were not checked.`);
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const lock = parsed as { lockfileVersion?: unknown; packages?: unknown };
  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
    if (lock.lockfileVersion !== undefined) limitations.push(`${file.path}: only package-lock.json lockfile versions 2 and 3 are covered.`);
    return [];
  }
  if (!lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) {
    limitations.push(`${file.path}: no v2/v3 package entries were available.`);
    return [];
  }

  const packages: LockedPackage[] = [];
  for (const [entryPath, raw] of Object.entries(lock.packages as Record<string, unknown>)) {
    if (!entryPath || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const name = packageNameFromEntry(entryPath);
    const version = (raw as { version?: unknown }).version;
    if (name && typeof version === "string" && version.length > 0) packages.push({ name, version, path: file.path });
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.path.localeCompare(b.path));
}

function severityFromAdvisory(advisory: OsvAdvisory): SecuritySeverity {
  const values = [
    advisory.database_specific?.severity,
    ...(advisory.severity ?? []).map((item) => `${item.type ?? ""} ${item.score ?? ""}`),
  ].join(" ").toLowerCase();
  if (values.includes("critical")) return "critical";
  if (values.includes("high")) return "high";
  if (values.includes("low")) return "low";
  return "medium";
}

function advisoryId(advisory: OsvAdvisory): string | null {
  const id = typeof advisory.id === "string" ? advisory.id.trim() : "";
  if (id) return id;
  const alias = advisory.aliases?.find((value) => typeof value === "string" && value.trim());
  return alias?.trim() ?? null;
}

function responseResults(response: AdvisoryLookupResult): readonly OsvBatchResult[] | null {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object" && Array.isArray(response.results)) return response.results;
  return null;
}

function deduplicateFindings(findings: readonly SecurityFinding[]): SecurityFinding[] {
  const secretSeen = new Map<string, SecurityFinding>();
  const packageSeen = new Map<string, SecurityFinding>();
  for (const finding of findings) {
    const key = finding.package && finding.advisoryId
      ? `${finding.package}\u0000${finding.advisoryId}`
      : `${finding.rule}\u0000${finding.path}\u0000${finding.line ?? 0}`;
    const map = finding.package && finding.advisoryId ? packageSeen : secretSeen;
    if (!map.has(key)) map.set(key, finding);
  }
  return [...secretSeen.values(), ...packageSeen.values()].sort((a, b) =>
    a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule) || (a.advisoryId ?? "").localeCompare(b.advisoryId ?? ""),
  );
}

/**
 * Scan bounded repository files. Secret checks are local only. Dependency
 * checks call the injected lookup in bounded OSV-style batches and degrade to
 * coverage metadata when that lookup is absent, partial, or unavailable.
 */
export async function scanRepositorySecurity(
  inputFiles: readonly RepositoryFile[],
  optionsOrLookup: SecurityScanOptions | AdvisoryLookup = {},
): Promise<SecurityScanReport> {
  const options: SecurityScanOptions = typeof optionsOrLookup === "function" ? { advisoryLookup: optionsOrLookup } : optionsOrLookup;
  const limits = normalizedLimits(options.limits);
  const limitations: string[] = [];
  const files = sortedFiles(inputFiles).filter((file) => {
    if (typeof file.path !== "string" || typeof file.content !== "string") return false;
    return true;
  });
  const boundedFiles = files.slice(0, limits.maxFiles);
  const filesSkipped = files.length - boundedFiles.length;
  if (filesSkipped > 0) limitations.push(`File limit reached: inspected ${boundedFiles.length} of ${files.length} files.`);

  const findings: SecurityFinding[] = [];
  const lockedPackages: LockedPackage[] = [];
  let filesInspected = 0;
  for (const file of boundedFiles) {
    if (byteLength(file.content) > limits.maxFileBytes) {
      limitations.push(`${file.path}: file exceeds the ${limits.maxFileBytes}-byte limit and was skipped.`);
      continue;
    }
    filesInspected += 1;
    findings.push(...secretFindings(file));
    lockedPackages.push(...packagesFromLockfile(file, limitations));
  }

  const uniquePackages = [...new Map(lockedPackages.map((item) => [`${item.name}\u0000${item.version}`, item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const packagesInspected = Math.min(uniquePackages.length, limits.maxPackages);
  if (uniquePackages.length > limits.maxPackages) limitations.push(`Package limit reached: inspected ${packagesInspected} of ${uniquePackages.length} unique npm package/version entries.`);

  const advisoryLookup = options.advisoryLookup;
  let advisoryQueries = 0;
  let advisoryBatches = 0;
  let advisoryAvailability: AdvisoryAvailability = "not-configured";
  const packagesToQuery = uniquePackages.slice(0, limits.maxPackages);
  if (packagesToQuery.length > 0 && !advisoryLookup) {
    limitations.push("Dependency advisories unavailable: no advisory lookup was provided.");
  } else if (packagesToQuery.length > 0 && advisoryLookup) {
    advisoryAvailability = "complete";
    for (let offset = 0; offset < packagesToQuery.length; offset += limits.advisoryBatchSize) {
      const batch = packagesToQuery.slice(offset, offset + limits.advisoryBatchSize);
      const queries: AdvisoryQuery[] = batch.map((item) => ({ package: { ecosystem: "npm", name: item.name }, version: item.version }));
      advisoryQueries += queries.length;
      advisoryBatches += 1;
      let results: readonly OsvBatchResult[] | null = null;
      try {
        results = responseResults(await advisoryLookup(queries));
      } catch {
        advisoryAvailability = advisoryAvailability === "complete" && advisoryBatches === 1 ? "unavailable" : "partial";
        limitations.push(`Advisory lookup batch ${advisoryBatches} was unavailable; dependency findings for that batch may be missing.`);
        continue;
      }
      if (!results) {
        advisoryAvailability = "partial";
        limitations.push(`Advisory lookup batch ${advisoryBatches} returned an invalid OSV-style response.`);
        continue;
      }
      if (results.length < queries.length) {
        advisoryAvailability = "partial";
        limitations.push(`Advisory lookup batch ${advisoryBatches} returned ${results.length} of ${queries.length} results.`);
      }
      for (let index = 0; index < Math.min(results.length, batch.length); index += 1) {
        const result = results[index];
        for (const advisory of result?.vulns ?? []) {
          const id = advisoryId(advisory);
          if (!id) continue;
          const pkg = batch[index];
          findings.push({
            rule: "npm-osv-advisory",
            path: pkg.path,
            package: pkg.name,
            advisoryId: id,
            evidence: [`OSV advisory ${id} affects npm package ${pkg.name}@${pkg.version} (source contents were not sent to the advisory service).`],
            severity: severityFromAdvisory(advisory),
            recommendation: `Upgrade ${pkg.name} to a version that is not affected by ${id}, or apply the advisory's documented mitigation.`,
            confidenceBasis: "confirmed: injected OSV-style lookup returned an advisory for this exact npm package/version",
          });
        }
      }
    }
  }

  if (packagesToQuery.length === 0 && lockedPackages.length > 0 && !advisoryLookup) {
    // The no-package case above is intentionally silent; this branch is kept
    // impossible by construction and protects the availability contract if the
    // extraction implementation changes later.
    advisoryAvailability = "not-configured";
  }
  if (packagesToQuery.length === 0 && uniquePackages.length === 0) advisoryAvailability = "not-configured";

  const dedupedFindings = deduplicateFindings(findings);
  const coverage: SecurityScanCoverage = {
    filesInspected,
    filesSkipped,
    packagesInspected,
    advisoryQueries,
    advisoryBatches,
    advisoryAvailability,
    limitations: [...new Set(limitations)],
  };
  return { findings: dedupedFindings, coverage, limitations: coverage.limitations };
}

/** Short aliases for callers that prefer the concise scanner name. */
export const scanSecurity = scanRepositorySecurity;
export const scanRepositoryFiles = scanRepositorySecurity;
