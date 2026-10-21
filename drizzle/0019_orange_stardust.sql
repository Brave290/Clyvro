CREATE TABLE "code_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"title" text NOT NULL,
	"language" text NOT NULL,
	"results" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_reviews" ADD CONSTRAINT "code_reviews_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_reviews_org_idx" ON "code_reviews" USING btree ("organization_id","created_at");--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-rules-v52-light', 'Rules v5.2 + Website Vulnerability Scanner Report (Light)',
  'The audit report now carries a Website Vulnerability Scanner Report (Light) panel — overall risk level, Critical/High/Medium/Low counts, tests performed, and an honest Light-vs-Deep capability table. Rules v5.2 (47 checks) added CLY-105 (a Content-Security-Policy that exists but is weakened by unsafe-inline/unsafe-eval or wildcards) and CLY-106 (sensitive files like /.env publicly reachable, Deep scans only, probed headers-only so contents are never read).',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-own-csp', 'We hardened our own CSP — the exact fix CLY-105 recommends',
  'An external scanner (and then our own CLY-105) flagged clyvro.vercel.app for script-src ''unsafe-inline''. Fair cop: the site now mints a fresh CSP nonce per request, Next.js stamps it on every script it injects, and ''unsafe-inline'' is gone from script-src. A test in CI runs our own scanner rules against our own headers so we can never silently regress.',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-payment-region', 'Checkout region verification (billing country + VPN discard)',
  'Checkout now verifies the billing country you select against the region of your connection before any payment is created, and — when an IP-intelligence source is configured — VPN/proxy/Tor connections are turned away. Both checks exist to stop region-spoofed card fraud, and both tell you plainly when they refuse.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-deep-probes', 'Deep scans: injection detection probes + bot-proof roadmap voting',
  'Ownership-verified Deep scans now run non-destructive injection-detection probes (CLY-201…204): SQLi error detection, reflected-XSS marker, file-inclusion traversal, command-echo marker — bounded, labelled measured/heuristic, never data extraction. XXE remains honestly Not tested. The public roadmap board at /feature-requests is now read-only (no public vote buttons for bots to abuse); voting and Invite voters links live in your dashboard, with per-account rate guards.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-code-reviewer', 'Code Reviewer is live — and Hack Protection graduates',
  'Code Reviewer v1 is here: paste code and get a deterministic, line-by-line static review (hardcoded secrets, eval, SQL string-building, unsafe deserialization, disabled TLS verification, and more) with quoted evidence and an agent fix brief. Your source code is analysed in memory and never stored — only the findings are saved. Hack Protection also graduates out of beta with a new CSP-strength check, and shared reports get an embeddable Scanned-by-Clyvro score badge.',
  'feature', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
