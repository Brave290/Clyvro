ALTER TABLE "cron_job_runs" ADD COLUMN "trigger" text DEFAULT 'schedule' NOT NULL;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD COLUMN "response_headers" jsonb;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD COLUMN "response_body" text;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD COLUMN "response_content_type" text;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD COLUMN "response_bytes" integer;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD COLUMN "response_truncated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD COLUMN "final_url" text;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD COLUMN "last_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;