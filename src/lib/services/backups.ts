import { desc, eq, inArray } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import {
  aiPatternChecks, auditPages, audits, backups, clients, cronJobRuns, cronJobs,
  findings, organizations, projects, readinessChecks, scanSchedules,
} from "@/lib/db/schema";
import { r2Configured, r2DeleteObject, r2GetObject, r2PresignGet, r2PutObject } from "@/lib/r2";
import { requireAdminUser } from "@/lib/services/admin";
import { ScanError } from "@/lib/scanner/types";

/**
 * Export / backup / restore via Cloudflare R2.
 *
 * A backup is one versioned JSON archive per workspace (or one archive
 * holding every workspace, platform scope). Restore NEVER overwrites:
 * it inserts fresh copies with new ids (foreign keys remapped), after
 * a dry-run preview the user must confirm. Deliberately excluded from
 * archives: passwords, token hashes (domain-verification, share,
 * invite, reset), payments, usage counters and admin data — a restore
 * must never resurrect credentials or billing state.
 */

export const ARCHIVE_VERSION = 1;

type Row = Record<string, unknown>;

export interface WorkspaceArchive {
  version: number;
  kind: "workspace";
  exportedAt: string;
  organizationId: string;
  organizationName: string;
  tables: {
    clients: Row[]; projects: Row[]; audits: Row[]; auditPages: Row[]; findings: Row[];
    scanSchedules: Row[]; cronJobs: Row[]; cronJobRuns: Row[];
    readinessChecks: Row[]; aiPatternChecks: Row[];
  };
}

export interface PlatformArchive {
  version: number;
  kind: "platform";
  exportedAt: string;
  workspaces: WorkspaceArchive[];
}

const EMPTY_TABLES: WorkspaceArchive["tables"] = {
  clients: [], projects: [], audits: [], auditPages: [], findings: [],
  scanSchedules: [], cronJobs: [], cronJobRuns: [], readinessChecks: [], aiPatternChecks: [],
};

async function buildWorkspaceArchive(db: DB, organizationId: string): Promise<WorkspaceArchive> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  const [clientRows, projectRows, auditRows, scheduleRows, cronRows, readinessRows, aiRows] = await Promise.all([
    db.select().from(clients).where(eq(clients.organizationId, organizationId)),
    db.select().from(projects).where(eq(projects.organizationId, organizationId)),
    db.select().from(audits).where(eq(audits.organizationId, organizationId)),
    db.select().from(scanSchedules).where(eq(scanSchedules.organizationId, organizationId)),
    db.select().from(cronJobs).where(eq(cronJobs.organizationId, organizationId)),
    db.select().from(readinessChecks).where(eq(readinessChecks.organizationId, organizationId)),
    db.select().from(aiPatternChecks).where(eq(aiPatternChecks.organizationId, organizationId)),
  ]);
  const auditIds = auditRows.map((a) => a.id);
  const cronIds = cronRows.map((c) => c.id);
  const [pageRows, findingRows, cronRunRows] = await Promise.all([
    auditIds.length ? db.select().from(auditPages).where(inArray(auditPages.auditId, auditIds)) : Promise.resolve([]),
    auditIds.length ? db.select().from(findings).where(inArray(findings.auditId, auditIds)) : Promise.resolve([]),
    cronIds.length ? db.select().from(cronJobRuns).where(inArray(cronJobRuns.cronJobId, cronIds)) : Promise.resolve([]),
  ]);
  return {
    version: ARCHIVE_VERSION,
    kind: "workspace",
    exportedAt: new Date().toISOString(),
    organizationId,
    organizationName: org.name,
    tables: JSON.parse(JSON.stringify({
      clients: clientRows, projects: projectRows, audits: auditRows, auditPages: pageRows,
      findings: findingRows, scanSchedules: scheduleRows, cronJobs: cronRows, cronJobRuns: cronRunRows,
      readinessChecks: readinessRows, aiPatternChecks: aiRows,
    })) as WorkspaceArchive["tables"],
  };
}

function manifestOf(archive: WorkspaceArchive): Record<string, number> {
  return Object.fromEntries(Object.entries(archive.tables).map(([k, v]) => [k, (v as Row[]).length]));
}

export interface BackupView {
  id: string;
  scope: string;
  label: string;
  sizeBytes: number;
  manifest: Record<string, number>;
  organizationId: string | null;
  createdAt: string;
}

const toView = (b: typeof backups.$inferSelect): BackupView => ({
  id: b.id,
  scope: b.scope,
  label: b.label,
  sizeBytes: b.sizeBytes,
  manifest: (b.manifest ?? {}) as Record<string, number>,
  organizationId: b.organizationId,
  createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
});

export async function listBackups(organizationId: string, includePlatform: boolean, dbOverride?: DB): Promise<BackupView[]> {
  const db = dbOverride ?? (await getDb());
  const rows = includePlatform
    ? await db.select().from(backups).orderBy(desc(backups.createdAt)).limit(50)
    : await db.select().from(backups).where(eq(backups.organizationId, organizationId)).orderBy(desc(backups.createdAt)).limit(50);
  return rows.map(toView);
}

export async function createBackup(
  organizationId: string, userId: string, scope: "workspace" | "platform", dbOverride?: DB,
): Promise<BackupView> {
  if (!r2Configured()) {
    throw new ScanError("R2_NOT_CONFIGURED", "Cloudflare R2 isn't configured yet — add the R2 credentials in the server environment to switch backups on.");
  }
  const db = dbOverride ?? (await getDb());
  const id = newId();
  let body: string;
  let label: string;
  let manifest: Record<string, number>;
  let orgForRow: string | null = organizationId;
  if (scope === "platform") {
    await requireAdminUser(userId, db);
    const orgs = await db.select({ id: organizations.id }).from(organizations);
    const workspaces: WorkspaceArchive[] = [];
    for (const o of orgs) workspaces.push(await buildWorkspaceArchive(db, o.id));
    const archive: PlatformArchive = { version: ARCHIVE_VERSION, kind: "platform", exportedAt: new Date().toISOString(), workspaces };
    body = JSON.stringify(archive);
    label = `Platform backup — ${workspaces.length} workspace(s)`;
    manifest = { workspaces: workspaces.length };
    orgForRow = null;
  } else {
    const archive = await buildWorkspaceArchive(db, organizationId);
    body = JSON.stringify(archive);
    label = `Workspace backup — ${archive.organizationName}`;
    manifest = manifestOf(archive);
  }
  const key = `backups/${scope}/${orgForRow ?? "platform"}/${id}.json`;
  await r2PutObject(key, body);
  await db.insert(backups).values({
    id, organizationId: orgForRow, createdBy: userId, scope, label,
    r2Key: key, sizeBytes: Buffer.byteLength(body), manifest, status: "stored",
  });
  const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  return toView(row);
}

async function loadBackupRow(db: DB, backupId: string, organizationId: string, isAdmin: boolean) {
  const [row] = await db.select().from(backups).where(eq(backups.id, backupId)).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Backup not found.");
  if (row.scope === "platform" && !isAdmin) throw new ScanError("FORBIDDEN", "Platform backups are owner-admin only.");
  if (row.scope === "workspace" && row.organizationId !== organizationId && !isAdmin) {
    throw new ScanError("FORBIDDEN", "That backup belongs to another workspace.");
  }
  return row;
}

async function loadArchive(row: typeof backups.$inferSelect): Promise<WorkspaceArchive[]> {
  if (!r2Configured()) throw new ScanError("R2_NOT_CONFIGURED", "Cloudflare R2 isn't configured, so this archive can't be read.");
  const raw = await r2GetObject(row.r2Key);
  const parsed = JSON.parse(raw) as WorkspaceArchive | PlatformArchive;
  if (parsed.version !== ARCHIVE_VERSION) throw new ScanError("VALIDATION", "That backup archive version isn't supported by this restore.");
  return parsed.kind === "platform" ? parsed.workspaces : [parsed];
}

export interface RestorePreview {
  backupId: string;
  scope: string;
  exportedAt: string;
  workspaces: { organizationId: string; organizationName: string; restorableHere: boolean; counts: Record<string, number> }[];
  notes: string[];
}

const RESTORE_NOTES = [
  "Restore inserts fresh copies with new IDs — it never overwrites or deletes existing data.",
  "Not restored (by design): share links, invitations, domain-verification tokens, payments, usage counters and team memberships.",
  "Restored scans keep their original dates, scores, findings and reports.",
];

export async function previewRestore(
  organizationId: string, backupId: string, userId: string, dbOverride?: DB,
): Promise<RestorePreview> {
  const db = dbOverride ?? (await getDb());
  const isAdmin = await requireAdminUser(userId, db).then(() => true).catch(() => false);
  const row = await loadBackupRow(db, backupId, organizationId, isAdmin);
  const archives = await loadArchive(row);
  return {
    backupId,
    scope: row.scope,
    exportedAt: archives[0]?.exportedAt ?? "",
    workspaces: archives.map((a) => ({
      organizationId: a.organizationId,
      organizationName: a.organizationName,
      restorableHere: a.organizationId === organizationId,
      counts: manifestOf(a),
    })),
    notes: RESTORE_NOTES,
  };
}

const d = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

async function restoreWorkspaceInto(db: DB, archive: WorkspaceArchive, organizationId: string, userId: string): Promise<Record<string, number>> {
  const t = archive.tables ?? EMPTY_TABLES;
  const clientMap = new Map<string, string>();
  const projectMap = new Map<string, string>();
  const auditMap = new Map<string, string>();
  const cronMap = new Map<string, string>();
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    for (const c of t.clients) {
      const nid = newId(); clientMap.set(String(c.id), nid);
      await tx.insert(clients).values({
        id: nid, organizationId, name: String(c.name), contactName: (c.contactName as string) ?? null,
        contactEmail: (c.contactEmail as string) ?? null, notes: (c.notes as string) ?? null,
        createdBy: userId, archivedAt: c.archivedAt ? d(c.archivedAt) : null, createdAt: d(c.createdAt),
      });
    }
    counts.clients = t.clients.length;
    for (const p of t.projects) {
      const nid = newId(); projectMap.set(String(p.id), nid);
      await tx.insert(projects).values({
        id: nid, organizationId, clientId: p.clientId ? (clientMap.get(String(p.clientId)) ?? null) : null,
        name: String(p.name), siteUrl: String(p.siteUrl), createdBy: userId,
        archivedAt: p.archivedAt ? d(p.archivedAt) : null, createdAt: d(p.createdAt),
      });
    }
    counts.projects = t.projects.length;
    for (const a of t.audits) {
      const nid = newId(); auditMap.set(String(a.id), nid);
      await tx.insert(audits).values({
        id: nid, organizationId,
        projectId: a.projectId ? (projectMap.get(String(a.projectId)) ?? null) : null,
        requestedBy: userId, locale: String(a.locale ?? "en"), status: (a.status as never) ?? "completed",
        scanMode: String(a.scanMode ?? "normal"), consentAt: a.consentAt ? d(a.consentAt) : null,
        targetUrl: String(a.targetUrl), finalUrl: (a.finalUrl as string) ?? null,
        auditTypes: (a.auditTypes as string[]) ?? ["generic"], rulesetVersion: (a.rulesetVersion as string) ?? null,
        score: (a.score as number) ?? null, technology: (a.technology as never) ?? null,
        coverage: (a.coverage as never) ?? null, limitations: (a.limitations as string[]) ?? null,
        errorCode: (a.errorCode as string) ?? null, errorMessage: (a.errorMessage as string) ?? null,
        durationMs: (a.durationMs as number) ?? null,
        startedAt: a.startedAt ? d(a.startedAt) : null, finishedAt: a.finishedAt ? d(a.finishedAt) : null,
        createdAt: d(a.createdAt),
      });
    }
    counts.audits = t.audits.length;
    for (const p of t.auditPages) {
      const auditId = auditMap.get(String(p.auditId));
      if (!auditId) continue;
      await tx.insert(auditPages).values({
        id: newId(), auditId, url: String(p.url), status: Number(p.status ?? 0),
        bytes: Number(p.bytes ?? 0), durationMs: Number(p.durationMs ?? 0), title: (p.title as string) ?? null,
      });
    }
    counts.auditPages = t.auditPages.length;
    for (const f of t.findings) {
      const auditId = auditMap.get(String(f.auditId));
      if (!auditId) continue;
      await tx.insert(findings).values({
        id: newId(), auditId, findingKey: String(f.findingKey), ruleId: String(f.ruleId),
        ruleVersion: String(f.ruleVersion), category: String(f.category), severity: String(f.severity),
        confidenceBasis: String(f.confidenceBasis), page: String(f.page), title: String(f.title),
        explanation: String(f.explanation), evidence: (f.evidence as string[]) ?? [],
        recommendation: String(f.recommendation), effort: String(f.effort),
        impactRationale: String(f.impactRationale), status: (f.status as never) ?? "open",
        createdAt: d(f.createdAt),
      });
    }
    counts.findings = t.findings.length;
    for (const s of t.scanSchedules) {
      const projectId = projectMap.get(String(s.projectId));
      if (!projectId) continue;
      // One schedule per project (unique index): skip if the project already has one.
      const [existing] = await tx.select({ id: scanSchedules.id }).from(scanSchedules).where(eq(scanSchedules.projectId, projectId)).limit(1);
      if (existing) continue;
      await tx.insert(scanSchedules).values({
        id: newId(), organizationId, projectId, createdBy: userId, locale: String(s.locale ?? "en"),
        enabled: Boolean(s.enabled), cadence: (s.cadence as never) ?? "daily",
        weekday: (s.weekday as number) ?? null, timeZone: String(s.timeZone ?? "UTC"),
        nextRunAt: d(s.nextRunAt), lastRunAt: s.lastRunAt ? d(s.lastRunAt) : null,
        lastError: (s.lastError as string) ?? null, createdAt: d(s.createdAt), updatedAt: d(s.updatedAt ?? s.createdAt),
      });
    }
    counts.scanSchedules = t.scanSchedules.length;
    for (const c of t.cronJobs) {
      const nid = newId(); cronMap.set(String(c.id), nid);
      await tx.insert(cronJobs).values({
        id: nid, organizationId, createdBy: userId, name: String(c.name), url: String(c.url),
        method: String(c.method ?? "GET"), body: (c.body as string) ?? null,
        intervalMinutes: Number(c.intervalMinutes ?? 1440), enabled: Boolean(c.enabled),
        nextRunAt: d(c.nextRunAt), lastRunAt: c.lastRunAt ? d(c.lastRunAt) : null,
        lastStatus: (c.lastStatus as number) ?? null, lastError: (c.lastError as string) ?? null,
        createdAt: d(c.createdAt),
      });
    }
    counts.cronJobs = t.cronJobs.length;
    for (const r of t.cronJobRuns) {
      const cronJobId = cronMap.get(String(r.cronJobId));
      if (!cronJobId) continue;
      await tx.insert(cronJobRuns).values({
        id: newId(), cronJobId, status: (r.status as number) ?? null, ok: Boolean(r.ok),
        durationMs: (r.durationMs as number) ?? null, error: (r.error as string) ?? null, createdAt: d(r.createdAt),
      });
    }
    counts.cronJobRuns = t.cronJobRuns.length;
    for (const r of t.readinessChecks) {
      await tx.insert(readinessChecks).values({
        id: newId(), organizationId, requestedBy: userId, domain: String(r.domain),
        tier: String(r.tier), results: r.results as never, summary: r.summary as never, createdAt: d(r.createdAt),
      });
    }
    counts.readinessChecks = t.readinessChecks.length;
    for (const r of t.aiPatternChecks) {
      await tx.insert(aiPatternChecks).values({
        id: newId(), organizationId, requestedBy: userId, domain: String(r.domain),
        results: r.results as never, summary: r.summary as never, createdAt: d(r.createdAt),
      });
    }
    counts.aiPatternChecks = t.aiPatternChecks.length;
  });

  return counts;
}

export async function applyRestore(
  organizationId: string, backupId: string, userId: string, dbOverride?: DB,
): Promise<{ restored: Record<string, number>; workspace: string }> {
  const db = dbOverride ?? (await getDb());
  const isAdmin = await requireAdminUser(userId, db).then(() => true).catch(() => false);
  const row = await loadBackupRow(db, backupId, organizationId, isAdmin);
  const archives = await loadArchive(row);
  const mine = archives.find((a) => a.organizationId === organizationId);
  if (!mine) {
    throw new ScanError("VALIDATION", "This backup doesn't contain the current workspace, so it can't be restored here. Open the workspace it belongs to and restore it there.");
  }
  const restored = await restoreWorkspaceInto(db, mine, organizationId, userId);
  return { restored, workspace: mine.organizationName };
}

export async function deleteBackup(organizationId: string, backupId: string, userId: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const isAdmin = await requireAdminUser(userId, db).then(() => true).catch(() => false);
  const row = await loadBackupRow(db, backupId, organizationId, isAdmin);
  if (r2Configured()) await r2DeleteObject(row.r2Key);
  await db.delete(backups).where(eq(backups.id, backupId));
}

export async function backupDownloadUrl(organizationId: string, backupId: string, userId: string, dbOverride?: DB): Promise<string> {
  const db = dbOverride ?? (await getDb());
  const isAdmin = await requireAdminUser(userId, db).then(() => true).catch(() => false);
  const row = await loadBackupRow(db, backupId, organizationId, isAdmin);
  if (!r2Configured()) throw new ScanError("R2_NOT_CONFIGURED", "Cloudflare R2 isn't configured.");
  return r2PresignGet(row.r2Key, 900);
}

export { r2Configured };
