import {
  pgTable, text, integer, timestamp, jsonb, boolean, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import type { ScanCheckpoint } from "@/lib/scanner/types";

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
  /** Null for OAuth-only accounts (e.g. Google) that never set a password. */
  passwordHash: text("password_hash"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  planId: text("plan_id").notNull().default("freemium"),
  /** When the paid plan grant ends (null = no expiry, e.g. freemium). An expired paid plan downgrades to freemium on next read. */
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
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
  /** Null = quick scan from the Scan tab: no saved website/project required. Still quota-charged and fully saved. */
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => users.id),
  locale: text("locale").notNull().default("en"),
  status: text("status").$type<AuditStatus>().notNull().default("queued"),
  /** Dashboard-only crawl intensity: "normal" | "strict" | "deep" (Pro+, owner-consented). Scoring is identical. */
  scanMode: text("scan_mode").notNull().default("normal"),
  /** When the requester confirmed they own/are authorized to deeply scan the target (deep mode only). */
  consentAt: timestamp("consent_at", { withTimezone: true }),
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
  /** Kept as an idempotency key, not an FK: quota history survives audit deletion. */
  auditId: text("audit_id").notNull(),
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
  failureCount: integer("failure_count").notNull().default(0),
  checkpoint: jsonb("checkpoint").$type<ScanCheckpoint | null>(),
  lastError: text("last_error"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("scan_jobs_audit_unique").on(t.auditId),
  index("scan_jobs_status_created_idx").on(t.status, t.createdAt),
]);

/** Daily-dispatched monitoring schedule; the actual instant is stored in UTC. */
export const scanSchedules = pgTable("scan_schedules", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  locale: text("locale").notNull().default("en"),
  enabled: boolean("enabled").notNull().default(true),
  cadence: text("cadence").$type<"daily" | "weekly">().notNull().default("daily"),
  weekday: integer("weekday"), // 0 (Sunday) through 6 (Saturday), in timeZone
  timeZone: text("time_zone").notNull().default("UTC"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("scan_schedules_project_unique").on(t.projectId),
  index("scan_schedules_due_idx").on(t.enabled, t.nextRunAt),
  index("scan_schedules_org_idx").on(t.organizationId),
]);

/**
 * Plan purchases via Flutterwave. One row per checkout attempt; `txRef` is
 * our unique reference (idempotency key for webhooks). `amount` is in the
 * currency's main unit (e.g. 29000 = ₦29,000), matching Flutterwave's API.
 * Status flow: pending → successful | failed. A successful payment grants
 * 30 days of the plan (organizations.planExpiresAt) — no auto-renewal.
 */
export const payments = pgTable("payments", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  planId: text("plan_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  txRef: text("tx_ref").notNull(),
  /** Flutterwave's transaction id, set after verification. */
  flwTxId: text("flw_tx_id"),
  status: text("status").notNull().default("pending"), // pending | successful | failed
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("payments_tx_ref_unique").on(t.txRef),
  index("payments_org_created_idx").on(t.organizationId, t.createdAt),
]);

/**
 * Completed anonymous public scans (one row per finished check on /scan).
 * Exists so the homepage can report REAL totals: public scans run through
 * resumable slices and never touch `audits`, so without this table they
 * were invisible to the public stats. `scanKey` is a deterministic hash of
 * the finished report (target + start + final URL), so a retried final
 * slice can never double-count. No IPs, device signals, or user data here —
 * only aggregate-safe numbers.
 */
export const publicScans = pgTable("public_scans", {
  id: id(),
  scanKey: text("scan_key").notNull(),
  status: text("status").notNull(), // completed | partial (failed scans are never recorded)
  pagesFetched: integer("pages_fetched").notNull().default(0),
  findingsCount: integer("findings_count").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("public_scans_key_unique").on(t.scanKey),
]);

/**
 * Password-reset tokens. Only the SHA-256 hash is stored; the raw token
 * exists solely in the emailed link. One hour expiry, single use
 * (`usedAt`), and requesting a new one invalidates earlier unused ones.
 */
export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("password_resets_token_unique").on(t.tokenHash),
  index("password_resets_user_idx").on(t.userId, t.createdAt),
]);

/**
 * Customer HTTP cron jobs — Clyvro's own scheduler (no external cron
 * service). A job pings a user URL (GET or POST) every `intervalMinutes`.
 * Execution is database-driven: due jobs run whenever the app is active
 * (dashboard use, scan polling) and at least once daily via the
 * dispatcher — best-effort timing, stated honestly in the UI. Targets
 * pass the same SSRF boundary as the scanner (public URLs only).
 */
export const cronJobs = pgTable("cron_jobs", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  method: text("method").notNull().default("GET"), // GET | POST
  /** Optional JSON body for POST jobs (max ~2KB, validated in the service). */
  body: text("body"),
  intervalMinutes: integer("interval_minutes").notNull().default(1440),
  enabled: boolean("enabled").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastStatus: integer("last_status"),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (t) => [
  index("cron_jobs_due_idx").on(t.enabled, t.nextRunAt),
  index("cron_jobs_org_idx").on(t.organizationId, t.createdAt),
]);

/** Recent execution log per cron job (bounded in the service by pruning). */
export const cronJobRuns = pgTable("cron_job_runs", {
  id: id(),
  cronJobId: text("cron_job_id").notNull().references(() => cronJobs.id, { onDelete: "cascade" }),
  status: integer("status"), // HTTP status, null on network/validation failure
  ok: boolean("ok").notNull().default(false),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [
  index("cron_job_runs_job_idx").on(t.cronJobId, t.createdAt),
]);

/**
 * Project Readiness checks: deterministic domain/tech profile
 * (stack fingerprints, hosting/DNS, domain registration via RDAP, TLS,
 * security headers, email auth). `results` is the full check list;
 * `summary` holds counts for list views. No invented "deployment date" —
 * only sourced dates (domain creation, certificate issue) are stored.
 */
export const readinessChecks = pgTable("readiness_checks", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => users.id),
  domain: text("domain").notNull(),
  tier: text("tier").notNull(), // basic | full (the set that ran)
  results: jsonb("results").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("readiness_checks_org_idx").on(t.organizationId, t.createdAt),
]);
