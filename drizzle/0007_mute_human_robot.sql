ALTER TABLE "audits" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;