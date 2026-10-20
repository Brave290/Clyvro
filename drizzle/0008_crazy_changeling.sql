CREATE TABLE "public_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_key" text NOT NULL,
	"status" text NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"findings_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_scans_key_unique" ON "public_scans" USING btree ("scan_key");