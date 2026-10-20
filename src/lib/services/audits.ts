import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, count } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import type { ScanMode } from "@/lib/scan-modes";
import {
  audits, auditPages, findings, organizations, projects, scanJobs, shareTokens, usageEvents,
  type FindingStatus,
} from "@/lib/db/schema";
import { effectivePlanForOrg, planAllowsAuditTypes, type AuditType } from "@/lib/plans";
import { reserveScanQuota } from "./entitlements";
import { assertDomainVerified } from "./domain-verification";
import { assertPublicUrl } from "@/lib/scanner/ssrf";
import { normalizeScanInput } from "@/lib/scanner/scan";
import type { Finding } from "@/lib/types";
import type { ScanReport } from "@/lib/scanner/types";
import { ScanError } from "@/lib/scanner/types";
import { normalizeLocale } from "@/lib/locale";

/* ---------------- helpers ---------------- */

export function findingKey(f: Pick<Finding, "ruleId" | "page" | "title">): string {
  // Plain composite key — computable identically on client and server.
  return `${f.ruleId}|${f.page}|${f.title}`;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function orgOrThrow(db: DB, organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  return org;
}

async function projectInOrgOrThrow(db: DB, organizationId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .limit(1);
  // Same error whether the project doesn't exist or belongs to another org — no data leak.
  if (!project) throw new ScanError("NOT_FOUND", "Project not found.");
  return project;
}

/* ---------------- projects ---------------- */

export async function createProject(
  organizationId: string, userId: string, input: { name: string; siteUrl: string; clientId?: string | null }, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const org = await orgOrThrow(db, organizationId);
  const plan = effectivePlanForOrg(org);
  const name = input.name.trim();
  if (!name) throw new ScanError("VALIDATION", "Give the project a name.");
  if (input.clientId) {
    const { clientInOrgOrThrow } = await import("./clients");
    await clientInOrgOrThrow(db, organizationId, input.clientId);
  }
  let siteUrl: URL;
  try {
    siteUrl = (await assertPublicUrl(normalizeScanInput(input.siteUrl))).url;
  } catch (err) {
    // Projects may point at temporarily-unresolvable hosts? No — keep stored URLs scannable.
    throw err;
  }
  const [{ value: activeCount }] = await db
    .select({ value: count() })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)));
  if (activeCount >= plan.maxProjects) {
    throw new ScanError(
      "PLAN_LIMIT",
      `The ${plan.name} plan allows ${plan.maxProjects} project${plan.maxProjects === 1 ? "" : "s"}. Upgrade to add more (paid plans launch soon — see Pricing).`,
    );
  }
  const project = { id: newId(), organizationId, clientId: input.clientId ?? null, name, siteUrl: siteUrl.href, createdBy: userId };
  await db.insert(projects).values(project);
  return project;
}

export async function listProjects(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .orderBy(desc(projects.createdAt));
}

/** Permanently remove every project, including archived projects, and its audit tree. */
export async function deleteAllProjects(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.transaction(async (tx) => {
    const [{ value: projectCount }] = await tx
      .select({ value: count() })
      .from(projects)
      .where(eq(projects.organizationId, organizationId));
    const [{ value: auditCount }] = await tx
      .select({ value: count() })
      .from(audits)
      .where(eq(audits.organizationId, organizationId));
    await tx.delete(projects).where(eq(projects.organizationId, organizationId));
    return { projectsDeleted: projectCount, auditsDeleted: auditCount };
  });
}

export async function getProject(organizationId: string, projectId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return projectInOrgOrThrow(db, organizationId, projectId);
}

/* ---------------- usage & quotas ---------------- */

function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function monthlyScanUsage(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [{ value }] = await db
    .select({ value: count() })
    .from(usageEvents)
    .where(and(eq(usageEvents.organizationId, organizationId), gte(usageEvents.createdAt, startOfMonth())));
  return value;
}

/** Workspace-wide scan quota history for the dashboard; failed scans never create usage events. */
export async function dashboardScanUsage(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const org = await orgOrThrow(db, organizationId);
  const plan = effectivePlanForOrg(org);
  const timelineStart = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
  const [used, events] = await Promise.all([
    monthlyScanUsage(organizationId, db),
    db.select({ createdAt: usageEvents.createdAt })
      .from(usageEvents)
      .where(and(eq(usageEvents.organizationId, organizationId), gte(usageEvents.createdAt, timelineStart)))
      .orderBy(asc(usageEvents.createdAt))
      .limit(1_000),
  ]);
  return {
    used,
    limit: plan.scansPerMonth,
    events: events.map((event) => event.createdAt.toISOString()),
  };
}

/* ---------------- audits ---------------- */

export async function startAudit(
  organizationId: string,
  userId: string,
  /** Null = quick scan (Scan tab): any public URL, no saved website needed. Quota and saving still apply. */
  projectId: string | null,
  input: { url?: string; auditTypes?: AuditType[]; locale?: unknown; scanMode?: ScanMode; consent?: boolean },
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const org = await orgOrThrow(db, organizationId);
  const plan = effectivePlanForOrg(org);
  const project = projectId ? await projectInOrgOrThrow(db, organizationId, projectId) : null;

  const auditTypes: AuditType[] = input.auditTypes?.length ? input.auditTypes : ["generic"];
  const scanMode: ScanMode = input.scanMode ?? "normal";

  const rawTarget = input.url?.trim() || project?.siteUrl;
  if (!rawTarget) throw new ScanError("VALIDATION", "Enter a website address to scan.");
  const target = await assertPublicUrl(normalizeScanInput(rawTarget));

  // Deep (private) scans: Pro+ only, requester consent recorded, AND the
  // domain must be DNS-verified for this workspace (server-side check —
  // a client flag can never substitute). SSRF validation above/below is
  // unchanged: verification never makes a private target scannable.
  if (scanMode === "deep") {
    if (!plan.deepScans) {
      throw new ScanError(
        "PLAN_LIMIT",
        `Deep private scans are a Pro feature — the ${plan.name} plan includes Normal and Strict. Upgrade to scan every route in your sitemap.`,
      );
    }
    if (!input.consent) {
      throw new ScanError(
        "CONSENT_REQUIRED",
        "Deep scans crawl the whole site. Please confirm you own this website or have the owner's permission to scan all of its pages.",
      );
    }
    await assertDomainVerified(organizationId, target.url.href, db);
  }

  const allowed = planAllowsAuditTypes(plan, auditTypes);
  if (!allowed.ok) {
    throw new ScanError(
      "PLAN_LIMIT",
      `The ${plan.name} plan doesn't include: ${allowed.denied.join(", ")}. It includes: ${plan.auditTypes.join(", ")}.`,
    );
  }

  const auditId = newId();
  await db.transaction(async (tx) => {
    // Central entitlement gate: atomic (org row locked + usage re-counted
    // inside the transaction), so simultaneous starts can't overrun quota.
    await reserveScanQuota(tx, organizationId);
    await tx.insert(audits).values({
      id: auditId, organizationId, projectId, requestedBy: userId,
      locale: normalizeLocale(input.locale), status: "queued", targetUrl: target.url.href, auditTypes,
      scanMode,
      consentAt: scanMode === "deep" ? new Date() : null,
    });
    await tx.insert(scanJobs).values({ id: newId(), auditId, status: "queued" });
  });
  return { auditId };
}

/**
 * Cancel a queued/running audit. The worker's completion write is guarded
 * by its lease, so a cancelled job can never publish results afterwards.
 * Cancelled scans are never charged.
 */
export async function cancelAudit(organizationId: string, auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.transaction(async (tx) => {
    const [audit] = await tx.select().from(audits)
      .where(and(eq(audits.id, auditId), eq(audits.organizationId, organizationId))).limit(1);
    if (!audit) throw new ScanError("NOT_FOUND", "Audit not found.");
    if (audit.status !== "queued" && audit.status !== "running") {
      throw new ScanError("VALIDATION", "Only a queued or running scan can be cancelled.");
    }
    await tx.update(scanJobs).set({
      status: "cancelled", checkpoint: null, lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date(),
    }).where(and(eq(scanJobs.auditId, auditId), inArray(scanJobs.status, ["queued", "running"])));
    await tx.update(audits).set({
      status: "cancelled", errorCode: "CANCELLED",
      errorMessage: "Cancelled by the workspace. No quota was charged.",
      finishedAt: new Date(),
    }).where(eq(audits.id, auditId));
    return { id: auditId, status: "cancelled" as const };
  });
}

/**
 * Retry a failed / timed-out / cancelled audit in place (same audit id,
 * so the idempotent usage key still guarantees a single charge ever).
 * Entitlements, deep-scan plan gate, and domain verification are all
 * re-checked — a retry can never smuggle in access that lapsed since.
 */
export async function retryAudit(organizationId: string, auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [audit] = await db.select().from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.organizationId, organizationId))).limit(1);
  if (!audit) throw new ScanError("NOT_FOUND", "Audit not found.");
  if (!["failed", "timed_out", "cancelled"].includes(audit.status)) {
    throw new ScanError("VALIDATION", "Only a failed, timed-out, or cancelled scan can be retried.");
  }
  const org = await orgOrThrow(db, organizationId);
  const plan = effectivePlanForOrg(org);
  if (audit.scanMode === "deep") {
    if (!plan.deepScans) {
      throw new ScanError("PLAN_LIMIT", `Deep private scans are a Pro feature — the ${plan.name} plan no longer includes them.`);
    }
    await assertDomainVerified(organizationId, audit.targetUrl, db);
  }
  await db.transaction(async (tx) => {
    await reserveScanQuota(tx, organizationId);
    await tx.update(audits).set({
      status: "queued", startedAt: null, finishedAt: null, errorCode: null, errorMessage: null,
    }).where(eq(audits.id, auditId));
    const [job] = await tx.select({ id: scanJobs.id }).from(scanJobs).where(eq(scanJobs.auditId, auditId)).limit(1);
    if (job) {
      await tx.update(scanJobs).set({
        status: "queued", checkpoint: null, failureCount: 0, lastError: null,
        lockedAt: null, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date(),
      }).where(eq(scanJobs.id, job.id));
    } else {
      await tx.insert(scanJobs).values({ id: newId(), auditId, status: "queued" });
    }
  });
  return { id: auditId, status: "queued" as const };
}

export interface AuditDetail {
  audit: typeof audits.$inferSelect;
  pages: (typeof auditPages.$inferSelect)[];
  findings: (typeof findings.$inferSelect)[];
}

export async function getAuditDetail(organizationId: string, auditId: string, dbOverride?: DB): Promise<AuditDetail> {
  const db = dbOverride ?? (await getDb());
  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.organizationId, organizationId)))
    .limit(1);
  if (!audit) throw new ScanError("NOT_FOUND", "Audit not found.");
  const [pages, findingRows] = await Promise.all([
    db.select().from(auditPages).where(eq(auditPages.auditId, auditId)),
    db.select().from(findings).where(eq(findings.auditId, auditId)),
  ]);
  return { audit, pages, findings: findingRows };
}

export async function listProjectAudits(organizationId: string, projectId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await projectInOrgOrThrow(db, organizationId, projectId);
  return db
    .select()
    .from(audits)
    .where(and(eq(audits.projectId, projectId), eq(audits.organizationId, organizationId)))
    .orderBy(desc(audits.createdAt));
}

/** Latest audits across the workspace (Scan tab history), newest first. */
export async function listRecentAudits(organizationId: string, limit = 8, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const rows = await db
    .select()
    .from(audits)
    .where(eq(audits.organizationId, organizationId))
    .orderBy(desc(audits.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ auditId: findings.auditId, value: count() })
    .from(findings)
    .where(inArray(findings.auditId, rows.map((r) => r.id)))
    .groupBy(findings.auditId);
  const byId = new Map(counts.map((c) => [c.auditId, c.value]));
  return rows.map((audit) => ({ audit, findingsCount: byId.get(audit.id) ?? 0 }));
}

export async function setFindingStatus(organizationId: string, findingId: string, status: FindingStatus, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db
    .select({ finding: findings, auditOrg: audits.organizationId })
    .from(findings)
    .innerJoin(audits, eq(audits.id, findings.auditId))
    .where(eq(findings.id, findingId))
    .limit(1);
  if (!row || row.auditOrg !== organizationId) throw new ScanError("NOT_FOUND", "Finding not found.");
  await db.update(findings).set({ status }).where(eq(findings.id, findingId));
  return { id: findingId, status };
}

/** Reassembles the ScanReport JSON shape (the Phase 2 contract) from persisted rows. */
export function detailToScanReport(detail: AuditDetail): ScanReport {
  const { audit, pages, findings: rows } = detail;
  const toFinding = (r: (typeof rows)[number]): Finding => ({
    ruleId: r.ruleId, ruleVersion: r.ruleVersion, page: r.page,
    category: r.category as Finding["category"], severity: r.severity as Finding["severity"],
    confidenceBasis: r.confidenceBasis as Finding["confidenceBasis"],
    title: r.title, explanation: r.explanation, evidence: r.evidence,
    recommendation: r.recommendation, effort: r.effort as Finding["effort"],
    impactRationale: r.impactRationale,
  });
  const finished = ["completed", "partial", "failed", "timed_out", "cancelled"].includes(audit.status);
  return {
    // ScanReport's contract keeps its original status vocabulary; the
    // audit row's own status carries timed_out/cancelled distinctly.
    status: audit.status === "completed" || audit.status === "partial" ? audit.status : "failed",
    auditTypes: audit.auditTypes,
    target: audit.targetUrl,
    finalUrl: audit.finalUrl,
    startedAt: (audit.startedAt ?? audit.createdAt).toISOString(),
    durationMs: audit.durationMs ?? 0,
    rulesetVersion: audit.rulesetVersion ?? "—",
    score: finished ? audit.score : null,
    findings: rows.map(toFinding),
    pages: pages.map((p) => ({ url: p.url, status: p.status, bytes: p.bytes, durationMs: p.durationMs, title: p.title })),
    coverage: (audit.coverage as ScanReport["coverage"]) ?? {
      pagesFetched: 0, pagesParsed: 0, linksDiscovered: 0, linksChecked: 0, linksUnchecked: 0,
      formDestinationsChecked: 0, skippedByRobots: 0, truncatedPages: 0, maxPages: 0, maxDepth: 0, deadlineHit: false,
    },
    limitations: audit.limitations ?? [],
    error: audit.errorCode ? { code: audit.errorCode, message: audit.errorMessage ?? "Scan failed." } : null,
  };
}

/* ---------------- comparisons ---------------- */

export interface AuditComparison {
  scoreDelta: number | null;
  newFindings: (typeof findings.$inferSelect)[];
  resolvedFindings: (typeof findings.$inferSelect)[];
  persistingCount: number;
}

export async function compareAudits(
  organizationId: string, newerId: string, olderId: string, dbOverride?: DB,
): Promise<AuditComparison> {
  const [newer, older] = await Promise.all([
    getAuditDetail(organizationId, newerId, dbOverride),
    getAuditDetail(organizationId, olderId, dbOverride),
  ]);
  if (newer.audit.projectId !== older.audit.projectId) {
    throw new ScanError("VALIDATION", "Comparisons only make sense between audits of the same project.");
  }
  const olderKeys = new Map(older.findings.map((f) => [f.findingKey, f]));
  const newerKeys = new Map(newer.findings.map((f) => [f.findingKey, f]));
  return {
    scoreDelta:
      newer.audit.score !== null && older.audit.score !== null ? newer.audit.score - older.audit.score : null,
    newFindings: newer.findings.filter((f) => !olderKeys.has(f.findingKey)),
    resolvedFindings: older.findings.filter((f) => !newerKeys.has(f.findingKey)),
    persistingCount: newer.findings.filter((f) => olderKeys.has(f.findingKey)).length,
  };
}

/* ---------------- share tokens ---------------- */

export async function createShareToken(organizationId: string, userId: string, auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await getAuditDetail(organizationId, auditId, db); // authorization + existence (404s cross-org)
  const raw = randomBytes(32).toString("base64url"); // 256 bits of entropy
  const id = newId();
  await db.insert(shareTokens).values({
    id, auditId, organizationId, tokenHash: sha256(raw), createdBy: userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return { id, token: raw };
}

export async function listShareTokens(organizationId: string, auditId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await getAuditDetail(organizationId, auditId, db);
  return db
    .select({ id: shareTokens.id, createdAt: shareTokens.createdAt, expiresAt: shareTokens.expiresAt, revokedAt: shareTokens.revokedAt })
    .from(shareTokens)
    .where(and(eq(shareTokens.auditId, auditId), eq(shareTokens.organizationId, organizationId)))
    .orderBy(desc(shareTokens.createdAt));
}

export async function revokeShareToken(organizationId: string, tokenId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(shareTokens).where(eq(shareTokens.id, tokenId)).limit(1);
  if (!row || row.organizationId !== organizationId) throw new ScanError("NOT_FOUND", "Share link not found.");
  await db.update(shareTokens).set({ revokedAt: new Date() }).where(eq(shareTokens.id, tokenId));
}

/** Public, read-only access via an unguessable token. Returns null for any failure (no oracle). */
export async function getSharedAudit(rawToken: string, dbOverride?: DB): Promise<AuditDetail | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(shareTokens).where(eq(shareTokens.tokenHash, sha256(rawToken))).limit(1);
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  const detail = await getAuditDetail(row.organizationId, row.auditId, db).catch(() => null);
  if (!detail || detail.audit.status === "queued" || detail.audit.status === "running") return null;
  return detail;
}
