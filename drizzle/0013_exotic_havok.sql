CREATE TABLE "changelog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tag" text DEFAULT 'feature' NOT NULL,
	"version" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "changelog_entries_status_idx" ON "changelog_entries" USING btree ("status","published_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'changelog-seed-dev-tools',
  'Five new developer tools (Beta)',
  'SSL Monitor, DNS Inspector, Redirect Tracer, Headers Debugger, and Robots & Sitemap Tester are now in your workspace sidebar. Each one runs real checks against your domain and shows the evidence — certificate expiry, DNS records, redirect chains, response headers, and robots/sitemap rules.' || chr(10) || chr(10) || 'Every plan includes free starter runs so you can see them work; Ultra Agency runs them without counters.',
  'feature',
  'published',
  '2026-10-20T18:30:00Z',
  'system-seed'
);
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'changelog-seed-freemium-10',
  'Freemium now includes 10 scans a month',
  'The free plan now includes 10 website scans every month (up from 3), still with up to 10 pages per scan. Hack Protection and SEO Visibility also include free starter runs on every plan — full results, so you can see the value before upgrading.' || chr(10) || chr(10) || 'Ultra Agency removes every counter: unlimited scans, tools, and checks across the workspace.',
  'announcement',
  'published',
  '2026-10-20T19:30:00Z',
  'system-seed'
);
