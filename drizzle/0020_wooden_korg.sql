CREATE TABLE "github_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"installed_by" text NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text DEFAULT 'User' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"latest_seen_sha" text,
	"last_scanned_sha" text,
	"last_scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"requested_by" text,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"commit_sha" text,
	"results" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_reviews" ADD CONSTRAINT "repo_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_reviews" ADD CONSTRAINT "repo_reviews_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_reviews" ADD CONSTRAINT "repo_reviews_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_installation_unique" ON "github_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_installations_org_idx" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_repositories_installation_name_unique" ON "github_repositories" USING btree ("installation_id","full_name");--> statement-breakpoint
CREATE INDEX "github_repositories_org_idx" ON "github_repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repo_reviews_repo_idx" ON "repo_reviews" USING btree ("repository_id","created_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-flow-screenshot-previews', 'Flow Scan: clickable desktop & mobile screenshot previews',
  'Flow Scan reports now keep a phone-viewport (390×844) screenshot of the start page next to the desktop one. Every screenshot thumbnail in the visited-pages list opens a larger preview with a Desktop / Mobile toggle, so you can see exactly what the scan browser saw on each viewport. Pages without a capture say so honestly instead of showing a cropped fake.',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-code-reviewer-github-bot', 'Code Reviewer is now a GitHub bot',
  'Install the Clyvro bot on GitHub, register repositories, and run whole-repo reviews: the bot reads every reviewable file (vendor folders, lockfiles, binaries and oversized files skipped, counts shown) and runs the same deterministic line-evidence checks as the paste tool. Results open as a per-file detailed scan on the web with fix-brief export. Pushes to a registered repo flag it as scan-due; reviews only run when you press the button. Source code is analysed in memory and never stored — only findings are saved. The quick paste checker remains for one-off files.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
