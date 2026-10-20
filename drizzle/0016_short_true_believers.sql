CREATE TABLE "feature_request_votes" (
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_request_votes_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feature_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_request_votes" ADD CONSTRAINT "feature_request_votes_request_id_feature_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."feature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_votes" ADD CONSTRAINT "feature_request_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_request_votes_request_idx" ON "feature_request_votes" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "feature_requests_status_idx" ON "feature_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feature_requests_org_idx" ON "feature_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-feature-requests', 'Request features from inside the app',
  'Signed-in users now have a Feature Requests board: suggest what Clyvro should build next, upvote other workspaces'' requests, and watch honest statuses (requested, planned, in progress, shipped) set by the team. The Clyvro homepage also gained its missing specifics: exact plan prices, the 26-check ruleset v3.0 engine, and a link to this changelog as the dated shipping record.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
