ALTER TABLE "org_api_keys" ADD COLUMN "kind" text DEFAULT 'secret' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_api_keys" ADD COLUMN "origins" text;--> statement-breakpoint
CREATE TABLE "cli_device_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"organization_id" text,
	"user_id" text,
	"token_hash" text,
	"token_prefix" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "cli_device_codes" ADD CONSTRAINT "cli_device_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_device_codes" ADD CONSTRAINT "cli_device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cli_device_codes_hash_unique" ON "cli_device_codes" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cli_device_codes_user_code_unique" ON "cli_device_codes" USING btree ("user_code");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "version", "status", "published_at", "updated_by") VALUES (
  'cl-dev-20261023',
  'Lab scans real pages, plus API, CLI, MCP and Shield check',
  'Lab can scan a whole site you prove you own: sitemap, robots, links, common routes, and the sensitive-file list. HEAD first, then GET on live pages. One-request mode is still there.' || E'\n\n' ||
  'Site API now covers Lab, Pentest, Flow Scan, Hack Protection and SEO, with the same Pro/Agency keys. Site Guard can answer allow, challenge, or block. Challenge is a branded Clyvro check — drop in /shield.js with a site key.' || E'\n\n' ||
  'CLI signs in from your phone (a short code on /cli/device) or with an API key. MCP uses the same file so agents can run the tools. Start at /developers. Cron and Lab responses have a copy button for the full server reply.',
  'feature',
  'v8.0.0',
  'published',
  '2026-10-23T00:00:00.000Z',
  'founda'
) ON CONFLICT ("id") DO NOTHING;
