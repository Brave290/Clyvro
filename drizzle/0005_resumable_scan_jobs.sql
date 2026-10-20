ALTER TABLE "scan_jobs" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
ALTER TABLE "scan_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;