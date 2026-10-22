INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "version", "status", "published_at", "updated_by") VALUES (
  'cl-v65-20261022',
  'Clyvro v6.5 — scanner, Shield, SEO and polish',
  'Scanner v6.5 adds 14 new rules (CLY-107…120: robots/sitemap health, canonical hygiene, structured data, thin-content, HSTS, cookie flags, clickjacking, referrer policy, mixed-form, alt quality, orphan pages, redirect chains) with real fetch-backed evidence — not just label bumps. RULESET 6.5.0 is live on every engine including deep scans.' || E'\n\n' ||
  'Shield v6.5 adds 9 request-line signatures (XXE, SSRF metadata probes, CRLF, NoSQL, credential-stuffing, DoS repeaters, header injection) plus two honeypot paths (graphql/actuator) and an expanded scanner-UA list. Trust-by-browser, escalating bans, rate classes and emergency door untouched; autonomous threat scoring (confidence + severity) and auto-bans with branded incident email now fire without you watching.' || E'\n\n' ||
  'SEO Visibility now includes six AI-search checks (substance, entity markup, internal links, image alt, heading quality, crawlability without JS) and branded Clyvro-Dev-SEO UA. Domain verification keeps one clear error, guides platform subdomains (e.g. *.vercel.app) to the meta-tag method, and no longer re-issues pending codes. Cron jobs identify as Clyvro-Dev-Cron/1.0 with retry/backoff; the create form stays closed until you open it, and every run stores full headers + first 8 KB of body. Google sign-in cancellation now toasts “cancelled” instead of a generic error.' || E'\n\n' ||
  'Legal pages expanded (Privacy 10 sections, Terms 13) with honest data-handling, retention and Beta limits; footer links are now 44×44 touch targets and pricing fixes duplicate-link accessibility (CLY-095) with distinct aria-labels. Changelog, pricing and Admin Security are paginated — 3 events shown with “View previous” — and the overview is de-jammed.',
  'feature',
  'v6.5.0',
  'published',
  '2026-10-22T00:00:00.000Z',
  'founda'
) ON CONFLICT ("id") DO NOTHING;