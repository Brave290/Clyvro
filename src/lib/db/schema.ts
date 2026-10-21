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
  /** Platform-admin flag. NEVER self-grantable: set only via the documented env-provisioned admin flow. */
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  /** Suspended accounts cannot sign in; sessions and share tokens are revoked on suspension. */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  /** Per-user notification preferences ({scanResults, scheduledRuns, billing, quota}). Absent = defaults (all on). */
  notifyPrefs: jsonb("notify_prefs"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  planId: text("plan_id").notNull().default("freemium"),
  /** When the purchased plan grant ends (null = never — freemium or a life grant). An expired purchased plan degrades to freemium on next read. */
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  /** Admin-granted plan override — DISTINCT from the purchased subscription above. */
  adminPlanId: text("admin_plan_id"),
  adminPlanNote: text("admin_plan_note"),
  adminPlanSetBy: text("admin_plan_set_by"),
  adminPlanSetAt: timestamp("admin_plan_set_at", { withTimezone: true }),
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

export type AuditStatus = "queued" | "running" | "completed" | "partial" | "failed" | "timed_out" | "cancelled";

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
  /** Publicly observable technology profile from the scanner (names/categories/evidence only). */
  technology: jsonb("technology").$type<import("@/lib/tech-detection").DetectedTech[]>(),
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
  status: text("status").notNull().default("queued"), // queued | running | done | failed | timed_out | cancelled
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

/**
 * DNS TXT domain-ownership verification (required before deep/private
 * scans). The raw token is shown to the user once to place in DNS; only
 * its SHA-256 is stored. Verification is confirmed server-side only.
 */
export const domainVerifications = pgTable("domain_verifications", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  domain: text("domain").notNull(), // apex (no scheme/port); www is covered by the apex record
  tokenHash: text("token_hash").notNull(),
  /** TXT host to create: _clyvro-verify.<domain>. Value = the raw token (shown once at issue). */
  recordName: text("record_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | verified | expired
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("domain_verifications_org_domain_unique").on(t.organizationId, t.domain),
  index("domain_verifications_domain_idx").on(t.domain),
]);

/** Waitlist signups (public form). Emailed to the founder inbox + confirmation to the user when mail is configured. */
export const waitlistSignups = pgTable("waitlist_signups", {
  id: id(),
  email: text("email").notNull(),
  role: text("role"),
  source: text("source").notNull().default("homepage"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("waitlist_signups_email_unique").on(t.email)]);

/**
 * Durable notification outbox. One row per (kind, dedupeKey) — a retried
 * event can never notify twice. `status`: pending | sent | skipped_no_mailer
 * | failed. Never stores secrets; `error` keeps only a sanitized reason.
 */
export const notificationOutbox = pgTable("notification_outbox", {
  id: id(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // scan_completed | scan_partial | scan_failed | scan_timed_out | scheduled_run | quota_warning | payment_received | domain_verified | ...
  dedupeKey: text("dedupe_key").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("notification_outbox_dedupe_unique").on(t.dedupeKey),
  index("notification_outbox_pending_idx").on(t.status, t.createdAt),
]);

/** Editable legal pages (refund policy, privacy, terms) with draft/published split + revision history. */
export const legalPages = pgTable("legal_pages", {
  id: id(),
  slug: text("slug").notNull(), // "refund" | "privacy" | "terms" | ...
  title: text("title").notNull(),
  draftBody: text("draft_body").notNull().default(""),
  publishedBody: text("published_body"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  /** [{body, title, publishedAt, byEmail}] — bounded pruned history. */
  revisions: jsonb("revisions").notNull().default([]),
  updatedBy: text("updated_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("legal_pages_slug_unique").on(t.slug)]);

/**
 * Public changelog ("What's new") entries — admin-managed from
 * /admin/changelog. Drafts stay invisible until published; the public
 * /changelog page reads published rows only. Body is plain text
 * (paragraphs), sanitized on write — no HTML injection surface.
 */
export const changelogEntries = pgTable("changelog_entries", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  /** feature | improvement | fix | announcement */
  tag: text("tag").notNull().default("feature"),
  version: text("version"),
  /** draft | published */
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("changelog_entries_status_idx").on(t.status, t.publishedAt),
]);

/** Administrative audit log — every admin action is recorded. */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: id(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  detail: jsonb("detail"),
  createdAt: createdAt(),
}, (t) => [index("admin_audit_log_created_idx").on(t.createdAt)]);

/**
 * Website dispatcher run history. Every /api/cron/dispatch execution —
 * Vercel Cron, cron-job.org, admin manual run or activity-driven —
 * records one row so the Admin Cron section can show what actually ran,
 * when, and what it did. This is the MAIN website dispatcher, distinct
 * from customers' own in-app cron jobs (cron_jobs/cron_job_runs).
 */
export const dispatchRuns = pgTable("dispatch_runs", {
  id: id(),
  /** vercel-cron | cron-job.org | manual-admin | activity | external */
  trigger: text("trigger").notNull(),
  status: text("status").notNull().default("completed"), // completed | failed
  summary: jsonb("summary"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  createdAt: createdAt(),
}, (t) => [index("dispatch_runs_created_idx").on(t.createdAt)]);

/**
 * AI-Pattern & Generic-ness checks (Pro/Ultra): heuristic, evidence-led
 * analysis of how much a site's public copy/structure matches generic
 * AI/template patterns. `results` is the full signal list + score;
 * `summary` holds the band/counts for list views. Never stated as proof
 * of authorship — pattern likelihood only.
 */
export const aiPatternChecks = pgTable("ai_pattern_checks", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => users.id),
  domain: text("domain").notNull(),
  results: jsonb("results").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("ai_pattern_checks_org_idx").on(t.organizationId, t.createdAt),
]);

/**
 * Workspace/platform backups stored in Cloudflare R2 (S3-compatible).
 * The row is the catalogue entry; the archive bytes live only in R2
 * under `r2Key`. `scope`: workspace (one org) | platform (every org,
 * owner-admin only). Restore always runs a dry-run preview first and
 * inserts fresh rows with new ids — it never overwrites existing data.
 */
export const backups = pgTable("backups", {
  id: id(),
  /** Null for platform-scope backups (not owned by any one workspace). */
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  scope: text("scope").notNull().default("workspace"), // workspace | platform
  label: text("label").notNull(),
  r2Key: text("r2_key").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  /** Row counts per table at backup time ({projects: n, audits: n, ...}). */
  manifest: jsonb("manifest").notNull().default({}),
  status: text("status").notNull().default("stored"), // stored | failed
  createdAt: createdAt(),
}, (t) => [
  index("backups_org_idx").on(t.organizationId, t.createdAt),
  index("backups_scope_idx").on(t.scope, t.createdAt),
]);

/**
 * Feature requests from signed-in users (in-app board). Any workspace
 * can submit and upvote; statuses (requested → planned → in_progress →
 * shipped / not_planned) are set by platform admins only and are shown
 * publicly on the board, so nothing is promised silently — when it
 * ships, the changelog says so too.
 */
export const featureRequests = pgTable("feature_requests", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  /** scanner | reports | tools | billing | integrations | other */
  category: text("category").notNull().default("other"),
  /** requested | planned | in_progress | shipped | not_planned */
  status: text("status").notNull().default("requested"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("feature_requests_status_idx").on(t.status, t.createdAt),
  index("feature_requests_org_idx").on(t.organizationId, t.createdAt),
]);

/**
 * Rendered flow scans (Playwright, Pro/Ultra): a headless-Chromium
 * visit that renders pages with JavaScript, walks same-origin links,
 * and records a live step log. `steps` is appended to DURING the run
 * so the UI can stream progress; `report` is the final structured
 * result (pages, console errors, failed requests, notes). Steps and
 * notes are facts observed by the browser — nothing is simulated.
 */
export const flowScans = pgTable("flow_scans", {
  id: id(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => users.id),
  targetUrl: text("target_url").notNull(),
  /** queued | running | completed | failed */
  status: text("status").notNull().default("queued"),
  /** [{at, label, level: step|note|error, detail?}] — appended live during the run. */
  steps: jsonb("steps").notNull().default([]),
  report: jsonb("report"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("flow_scans_org_idx").on(t.organizationId, t.createdAt),
  index("flow_scans_status_idx").on(t.status, t.createdAt),
]);

/** One upvote per user per request (toggle). */
export const featureRequestVotes = pgTable("feature_request_votes", {
  requestId: text("request_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.requestId, t.userId] }), index("feature_request_votes_request_idx").on(t.requestId)]);

/** Tiny key-value store for platform settings (e.g. maintenance mode). */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
