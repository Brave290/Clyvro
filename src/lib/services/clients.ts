import { and, desc, eq, gte, isNull, count, inArray, ilike } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { audits, clients, findings, projects } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";

/**
 * Client workspaces (Phase 4). A client groups existing projects inside
 * one organization — projects are never duplicated or double-counted
 * against plan limits, they simply gain an optional client link.
 * Every query is organization-scoped; cross-org ids 404.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanClientInput(input: { name?: string; contactName?: string; contactEmail?: string; notes?: string }) {
  const name = input.name?.trim();
  if (!name) throw new ScanError("VALIDATION", "Give the client a name.");
  const contactEmail = input.contactEmail?.trim().toLowerCase() || null;
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    throw new ScanError("VALIDATION", "That contact email doesn't look right.");
  }
  return {
    name: name.slice(0, 120),
    contactName: input.contactName?.trim().slice(0, 120) || null,
    contactEmail,
    notes: input.notes?.trim().slice(0, 2000) || null,
  };
}

export async function createClient(
  organizationId: string, userId: string,
  input: { name: string; contactName?: string; contactEmail?: string; notes?: string },
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const client = { id: newId(), organizationId, createdBy: userId, ...cleanClientInput(input) };
  await db.insert(clients).values(client);
  return client;
}

export async function clientInOrgOrThrow(db: DB, organizationId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId), isNull(clients.archivedAt)))
    .limit(1);
  if (!client) throw new ScanError("NOT_FOUND", "Client not found.");
  return client;
}

export async function getClient(organizationId: string, clientId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return clientInOrgOrThrow(db, organizationId, clientId);
}

export interface ClientSummary {
  client: typeof clients.$inferSelect;
  projectCount: number;
  latestAudit: { id: string; score: number | null; status: string; createdAt: Date } | null;
}

export async function listClients(organizationId: string, search?: string, dbOverride?: DB): Promise<ClientSummary[]> {
  const db = dbOverride ?? (await getDb());
  const where = search?.trim()
    ? and(eq(clients.organizationId, organizationId), isNull(clients.archivedAt), ilike(clients.name, `%${search.trim()}%`))
    : and(eq(clients.organizationId, organizationId), isNull(clients.archivedAt));
  const rows = await db.select().from(clients).where(where).orderBy(desc(clients.createdAt));
  if (rows.length === 0) return [];

  const clientIds = rows.map((c) => c.id);
  const projectRows = await db
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt), inArray(projects.clientId, clientIds)));
  const projectsByClient = new Map<string, string[]>();
  for (const p of projectRows) {
    if (!p.clientId) continue;
    projectsByClient.set(p.clientId, [...(projectsByClient.get(p.clientId) ?? []), p.id]);
  }

  const allProjectIds = projectRows.map((p) => p.id);
  const latestByProject = new Map<string, ClientSummary["latestAudit"]>();
  if (allProjectIds.length) {
    const auditRows = await db
      .select({ id: audits.id, projectId: audits.projectId, score: audits.score, status: audits.status, createdAt: audits.createdAt })
      .from(audits)
      .where(and(eq(audits.organizationId, organizationId), inArray(audits.projectId, allProjectIds)))
      .orderBy(desc(audits.createdAt));
    for (const a of auditRows) {
      if (!a.projectId) continue; // quick scans have no project (query already filters, keeps TS honest)
      if (!latestByProject.has(a.projectId)) {
        latestByProject.set(a.projectId, { id: a.id, score: a.score, status: a.status, createdAt: a.createdAt });
      }
    }
  }

  return rows.map((client) => {
    const pids = projectsByClient.get(client.id) ?? [];
    const latest = pids
      .map((pid) => latestByProject.get(pid))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    return { client, projectCount: pids.length, latestAudit: latest };
  });
}

export async function updateClient(
  organizationId: string, clientId: string,
  input: { name: string; contactName?: string; contactEmail?: string; notes?: string },
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  await clientInOrgOrThrow(db, organizationId, clientId);
  await db.update(clients).set(cleanClientInput(input)).where(eq(clients.id, clientId));
  return clientInOrgOrThrow(db, organizationId, clientId);
}

/** Archives the client; its projects stay but become unassigned. */
export async function archiveClient(organizationId: string, clientId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  await clientInOrgOrThrow(db, organizationId, clientId);
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ clientId: null }).where(eq(projects.clientId, clientId));
    await tx.update(clients).set({ archivedAt: new Date() }).where(eq(clients.id, clientId));
  });
}

/** Assigns (or clears) a project's client. Both must belong to the org. */
export async function assignProjectClient(
  organizationId: string, projectId: string, clientId: string | null, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .limit(1);
  if (!project) throw new ScanError("NOT_FOUND", "Project not found.");
  if (clientId) await clientInOrgOrThrow(db, organizationId, clientId);
  await db.update(projects).set({ clientId }).where(eq(projects.id, projectId));
  return { projectId, clientId };
}

/* ---------------- portfolio overview (real data only) ---------------- */

export interface PortfolioOverview {
  clientCount: number;
  projectCount: number;
  auditsLast30d: number;
  failedLast30d: number;
  openCriticalHigh: number;
  recentAudits: {
    id: string; projectId: string | null; projectName: string; clientName: string | null;
    score: number | null; status: string; createdAt: Date;
  }[];
  /** Clients whose sites have no completed audit in the last 30 days (or ever). */
  staleClients: { id: string; name: string; lastCompletedAt: Date | null }[];
}

export async function portfolioOverview(organizationId: string, dbOverride?: DB): Promise<PortfolioOverview> {
  const db = dbOverride ?? (await getDb());
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [clientCount, projectCount, auditsLast30d, failedLast30d, projRows] = await Promise.all([
    db.select({ value: count() }).from(clients).where(and(eq(clients.organizationId, organizationId), isNull(clients.archivedAt))).then((r) => r[0].value),
    db.select({ value: count() }).from(projects).where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt))).then((r) => r[0].value),
    db.select({ value: count() }).from(audits).where(and(eq(audits.organizationId, organizationId), gte(audits.createdAt, since))).then((r) => r[0].value),
    db.select({ value: count() }).from(audits).where(and(eq(audits.organizationId, organizationId), eq(audits.status, "failed"), gte(audits.createdAt, since))).then((r) => r[0].value),
    db.select().from(projects).where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt))),
  ]);

  const clientNames = new Map(
    (await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, organizationId)))
      .map((c) => [c.id, c.name]),
  );
  const projectById = new Map(projRows.map((p) => [p.id, p]));

  const recent = await db
    .select({ id: audits.id, projectId: audits.projectId, score: audits.score, status: audits.status, createdAt: audits.createdAt })
    .from(audits)
    .where(eq(audits.organizationId, organizationId))
    .orderBy(desc(audits.createdAt))
    .limit(5);

  const [{ value: openCriticalHigh }] = await db
    .select({ value: count() })
    .from(findings)
    .innerJoin(audits, eq(audits.id, findings.auditId))
    .where(and(
      eq(audits.organizationId, organizationId),
      eq(findings.status, "open"),
      inArray(findings.severity, ["critical", "high"]),
    ));

  // Stale clients: have ≥1 project but no completed/partial audit in 30d.
  const lastCompletedByClient = new Map<string, Date>();
  if (projRows.length) {
    const completed = await db
      .select({ projectId: audits.projectId, createdAt: audits.createdAt })
      .from(audits)
      .where(and(eq(audits.organizationId, organizationId), inArray(audits.status, ["completed", "partial"])))
      .orderBy(desc(audits.createdAt));
    for (const a of completed) {
      if (!a.projectId) continue; // quick scans belong to no client
      const cid = projectById.get(a.projectId)?.clientId;
      if (cid && !lastCompletedByClient.has(cid)) lastCompletedByClient.set(cid, a.createdAt);
    }
  }
  const clientsWithProjects = new Set(projRows.map((p) => p.clientId).filter((x): x is string => !!x));
  const staleClients = [...clientsWithProjects]
    .map((cid) => ({ id: cid, name: clientNames.get(cid) ?? "Client", lastCompletedAt: lastCompletedByClient.get(cid) ?? null }))
    .filter((c) => !c.lastCompletedAt || c.lastCompletedAt < since)
    .slice(0, 5);

  return {
    clientCount, projectCount, auditsLast30d, failedLast30d, openCriticalHigh,
    recentAudits: recent.map((a) => {
      const p = a.projectId ? projectById.get(a.projectId) : undefined;
      return {
        id: a.id, projectId: a.projectId,
        projectName: p?.name ?? (a.projectId ? "Project" : "Quick scan"),
        clientName: p?.clientId ? clientNames.get(p.clientId) ?? null : null,
        score: a.score, status: a.status, createdAt: a.createdAt,
      };
    }),
    staleClients,
  };
}
