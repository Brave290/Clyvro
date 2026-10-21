CREATE TABLE "security_bans" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"reason" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'shield' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"ip_masked" text NOT NULL,
	"country" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"user_agent" text,
	"verdict" text NOT NULL,
	"rule" text NOT NULL,
	"matches" jsonb,
	"score" integer DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'monitor' NOT NULL,
	"subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "security_bans_expires_idx" ON "security_bans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "security_events_created_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_ip_idx" ON "security_events" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "security_events_subject_idx" ON "security_events" USING btree ("subject","created_at");