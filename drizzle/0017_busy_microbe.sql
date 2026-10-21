CREATE TABLE "flow_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"target_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "flow_scans" ADD CONSTRAINT "flow_scans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_scans" ADD CONSTRAINT "flow_scans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_scans_org_idx" ON "flow_scans" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_scans_status_idx" ON "flow_scans" USING btree ("status","created_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-flow-scan', 'Rendered flow scanning (Playwright) for Pro and Ultra Agency',
  'Pro and Ultra Agency workspaces can now run a Flow Scan: a real headless browser renders the site with JavaScript on, walks its pages like a visitor, and streams every step live while it works — pages rendered, links followed, and a notes log of anything that goes wrong (browser console errors, failed requests, unreachable steps). It never submits forms and never touches checkout or delete actions. The Clyvro homepage footer and homepage now also carry the public contact (admin.founda@gmail.com) and founding year (2026).',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
