import {
  pgTable, text, integer, timestamp, jsonb, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/**
 * Clyvro Phase 3 schema. Runs unchanged on Neon Postgres (production,
 * DATABASE_URL) and embedded PGlite (local/dev/tests). Every
 * organization-owned row carries organizationId for server-side scoping;
 * large page HTML is deliberately NOT stored.
 */

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  planId: text("plan_id").notNull().default("freemium"),
  brandName: text("brand_name"),
  /** Hex accent (#RRGGBB) for client-facing reports; applied only on white-label plans. */
  brandColor: text("brand_color"),
  reportFooter: text("report_footer"),
  createdAt: createdAt(),
});

export const memberships = pgTable("memberships", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"), // owner | admin | member | viewer (see lib/permissions.ts)
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index("memberships_user_idx").on(t.userId)]);

/** A client workspace inside an agency organization (Phase 4). Projects optionally belong to a client. */
export const clients = pgTable("clients", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  createdBy: text("created_by").notNull().references(() => users.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("clients_org_idx").on(t.organizationId)]);

export const projects = pgTable("projects", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  siteUrl: text("site_url").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("projects_org_idx").on(t.organizationId), index("projects_client_idx").on(t.clientId)]);

/** Single-use, expiring team invitations. Only the token hash is stored. */
export const invitations = pgTable("invitations", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"), // admin | member | viewer (owner is never invitable)
  tokenHash: text("token_hash").notNull(),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: text("accepted_by").references(() => users.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("invitations_token_unique").on(t.tokenHash), index("invitations_org_idx").on(t.organizationId)]);

/**
 * Anti-abuse claims for free-tier entry points (public scan, signup).
 * Stores only hashes of IP + coarse device signal — never raw IPs.
 */
export const abuseClaims = pgTable("abuse_claims", {
  id: id(),
  kind: text("kind").notNull(), // public-scan | signup
  claimHash: text("claim_hash").notNull(),
  count: integer("count").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("abuse_claims_kind_hash_unique").on(t.kind, t.claimHash)]);

export type AuditStatus = "queued" | "running" | "completed" | "partial" | "failed";

export const audits = pgTable("audits", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => users.id),
  status: text("status").$type<AuditStatus>().notNull().default("queued"),
  targetUrl: text("target_url").notNull(),
  finalUrl: text("final_url"),
  auditTypes: jsonb("audit_types").$type<string[]>().notNull().default(["generic"]),
  rulesetVersion: text("ruleset_version"),
  score: integer("score"),
  coverage: jsonb("coverage"),
  limitations: jsonb("limitations").$type<string[]>(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("audits_org_created_idx").on(t.organizationId, t.createdAt),
  index("audits_project_created_idx").on(t.projectId, t.createdAt),
  index("audits_status_idx").on(t.status),
]);

export const auditPages = pgTable("audit_pages", {
  id: id(),
  auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: integer("status").notNull(),
  bytes: integer("bytes").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  title: text("title"),
}, (t) => [index("audit_pages_audit_idx").on(t.auditId)]);

export type FindingStatus = "open" | "acknowledged" | "dismissed";

export const findings = pgTable("findings", {
  id: id(),
  auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
  /** Stable cross-audit identity for comparisons: ruleId|page|title-hash. */
  findingKey: text("finding_key").notNull(),
  ruleId: text("rule_id").notNull(),
  ruleVersion: text("rule_version").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  confidenceBasis: text("confidence_basis").notNull(),
  page: text("page").notNull(),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  evidence: jsonb("evidence").$type<string[]>().notNull(),
  recommendation: text("recommendation").notNull(),
  effort: text("effort").notNull(),
  impactRationale: text("impact_rationale").notNull(),
  status: text("status").$type<FindingStatus>().notNull().default("open"),
  createdAt: createdAt(),
}, (t) => [
  index("findings_audit_idx").on(t.auditId),
  index("findings_audit_key_idx").on(t.auditId, t.findingKey),
]);

export const shareTokens = pgTable("share_tokens", {
  id: id(),
  auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  /** SHA-256 of the raw token; the raw value is shown to the creator exactly once. */
  tokenHash: text("token_hash").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("share_tokens_hash_unique").on(t.tokenHash), index("share_tokens_audit_idx").on(t.auditId)]);

export const usageEvents = pgTable("usage_events", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  /** Unique per audit → job retries can never double-charge a scan. */
  auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("scan"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("usage_events_audit_unique").on(t.auditId),
  index("usage_events_org_created_idx").on(t.organizationId, t.createdAt),
]);

export const scanJobs = pgTable("scan_jobs", {
  id: id(),
  auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("scan_jobs_audit_unique").on(t.auditId),
  index("scan_jobs_status_created_idx").on(t.status, t.createdAt),
]);
