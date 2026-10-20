CREATE TABLE "ai_pattern_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"domain" text NOT NULL,
	"results" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"created_by" text NOT NULL,
	"scope" text DEFAULT 'workspace' NOT NULL,
	"label" text NOT NULL,
	"r2_key" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'stored' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_pattern_checks" ADD CONSTRAINT "ai_pattern_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_pattern_checks" ADD CONSTRAINT "ai_pattern_checks_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_pattern_checks_org_idx" ON "ai_pattern_checks" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "backups_org_idx" ON "backups" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "backups_scope_idx" ON "backups" USING btree ("scope","created_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-v300-rules', 'Scanner ruleset v3.0 — more accurate, evidence-first checks',
  'The website scanner now runs ruleset v3.0. New checks cover missing canonical tags, missing Open Graph sharing tags, skipped heading levels, exposed generator/version fingerprints, generic "click here" link text and thin pages. Duplicate-title findings now respect canonical tags, so pages that correctly point at another canonical URL are no longer flagged. Every finding still carries its rule ID, the exact evidence observed, and what was not checked.',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-ai-pattern-exports', 'AI-Pattern detector, agent-ready exports everywhere, live dashboards and R2 backups',
  'Pro and Ultra Agency plans can now run the AI-Pattern & Generic-ness detector: it scores how much a site''s public copy and structure match generic AI/template patterns, shows the evidence for every signal, and generates a ready-to-paste de-genericize prompt for your AI agent. It reports pattern likelihood only — never a false claim of proof about who wrote a site. Also new: Copy-for-agent, Markdown and JSON exports on every scan surface (Scanner, Readiness, Developer Tools); dashboards, usage counters and billing now update live without refreshing; and workspace backups (with dry-run restore previews) to Cloudflare R2. The five Developer Tools and Readiness have graduated out of Beta. Playwright-based user-flow scanning is in development and marked Coming Soon.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
