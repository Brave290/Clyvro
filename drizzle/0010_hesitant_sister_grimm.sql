CREATE TABLE "cron_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"cron_job_id" text NOT NULL,
	"status" integer,
	"ok" boolean DEFAULT false NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"body" text,
	"interval_minutes" integer DEFAULT 1440 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" integer,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"domain" text NOT NULL,
	"tier" text NOT NULL,
	"results" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD CONSTRAINT "cron_job_runs_cron_job_id_cron_jobs_id_fk" FOREIGN KEY ("cron_job_id") REFERENCES "public"."cron_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_checks" ADD CONSTRAINT "readiness_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readiness_checks" ADD CONSTRAINT "readiness_checks_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cron_job_runs_job_idx" ON "cron_job_runs" USING btree ("cron_job_id","created_at");--> statement-breakpoint
CREATE INDEX "cron_jobs_due_idx" ON "cron_jobs" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "cron_jobs_org_idx" ON "cron_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "readiness_checks_org_idx" ON "readiness_checks" USING btree ("organization_id","created_at");