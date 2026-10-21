CREATE TABLE "full_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"target_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stages" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "full_scans" ADD CONSTRAINT "full_scans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "full_scans" ADD CONSTRAINT "full_scans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "full_scans_org_idx" ON "full_scans" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "full_scans_status_idx" ON "full_scans" USING btree ("status","created_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-rules-v5', 'Rules v5.0 — 43 checks, tighter and more honest',
  'The scanner ruleset jumps to v5.0 (43 checks, CLY-001…CLY-102). New, researched findings include duplicate element IDs (split by whether labels/ARIA actually reference them), broken ARIA references, links with no text, invalid JSON-LD structured data, missing home-page security headers, identical link text leading to different pages, and canonical conflicts. Every finding still carries its rule ID, the exact evidence observed, and the fix — and scores may dip slightly on some sites, because the net is now finer. That is the tightening working, not a regression.',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-public-roadmap', 'Public roadmap — vote on what Clyvro builds next',
  'The feature-request board is now public at /feature-requests: anyone can read the ranking, and every request has an Invite voters link that lands supporters right on it. Voting still needs a free account (one vote per person, so the ranking stays honest), and admins triage the same board from the new Admin → Feature requests page, ranked by your upvotes.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-full-scan', 'Full Scan — every Clyvro engine in one run (Pro & Ultra)',
  'A surprise for Pro and Ultra workspaces: Full Scan runs everything at once — the Rules v5 audit, a rendered Flow Scan in a real browser, the AI-Pattern detector, and Project Readiness — then merges the results into one scoreboard with a single prioritised Top Fixes list and one combined fix brief for your coding agent. Each stage is isolated: if one engine cannot run, the others still complete and the report says so honestly. Find it in the sidebar under Full Scan.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
