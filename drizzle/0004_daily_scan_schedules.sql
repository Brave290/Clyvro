CREATE TABLE "scan_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_by" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"weekday" integer,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scan_schedules_project_unique" ON "scan_schedules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scan_schedules_due_idx" ON "scan_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "scan_schedules_org_idx" ON "scan_schedules" USING btree ("organization_id");