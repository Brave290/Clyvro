# Clyvro implementation plan

## Product direction and existing work

Clyvro is an evidence-first website audit SaaS for agencies and consultants. Keep the existing premium B2B visual language: blue `#2563EB`, readable contrast, clear evidence, stable interactions, shared form tokens, and mobile-first treatment. The cost-first daily dispatcher was selected. Phase 5 code is merged and live; do not repeat completed features or add tracking/payment behavior that the product does not support.

The merged work includes standardized forms, rebranded modals/selectors, owner color controls and project deletion, privacy-honest cookie notice, real public database aggregates, an organization usage chart, region-aware display currency, browser-local timestamps, organization-scoped schedules, a daily Vercel Cron dispatcher, and bounded resumable scanning.

The production owner workspace `Founda`, owned by `legateakanjimusab@gmail.com`, is now `ultra-agency` with no expiry. Checkout is inactive; this is an application entitlement grant only and is not a paid subscription or charge.

## Current implementation scope

### Mobile review and workspace shell

Inspect every page route at a phone viewport, including dynamic report, client, project, invite and shared-report routes. Use an isolated preview account for authenticated workspace checks and do not create test records in production. Fix layout defects supported by the review.

Replace the shared marketing navigation on `/app/*` with a workspace-first shell. Desktop uses a clear left sidebar with workspace identity, overview, clients, team, schedules, settings, plans/usage, and sign-out. Mobile uses an accessible drawer that exposes the same navigation and sign-out without requiring repeated top-bar taps. Marketing navigation remains on public routes. Keep the shared route-aware footer hidden on auth and workspace routes.

### Scan state correctness

When a scan is already complete, visiting or refreshing its result must restore the saved report and show an explicit completed state; it must not rerun work. Only incomplete resumable work may offer a resume action. Re-entry must not duplicate a job or consume quota twice. Preserve the existing finite per-request budgets, HMAC checkpoint signature/expiry, lease-safe database slices, SSRF protections, pinned-IP fetching, robots rules, organization scoping and honest partial-coverage reporting.

### GitHub MCP security assistant — implement now

Build a Clyvro integration through which a user can authorize a GitHub account and repositories with least-privilege permissions. The bot should scan code changes for vulnerabilities before production, report findings with evidence and severity, and notify users promptly. Keep connections and results organization-scoped. Provide Markdown and PDF report downloads for a user's agent and copyable, phased remediation/commit/push guidance. Require explicit user approval before writing to a customer repository; never push code silently.

The app integration must use its own GitHub App/installation and webhook credentials, not the task's preconfigured `gh` CLI identity. Build and test the product-side flow now, but do not claim a live customer connection until an App is installed and its credentials are securely configured.

### Operations and future work

Configure the missing `CRON_SECRET` only in Vercel Production through a secure flow, then verify that the daily dispatcher accepts the secret and rejects unauthorized requests. Keep one daily Vercel Cron at `0 3 * * *`; do not ping Neon merely to prevent scale-to-zero and do not start a second cron-job.org poller. The in-app usage chart remains scans-versus-quota. Add real monetary spending only after billing/cost metering exists; never invent a dollar value.

Add a separate future roadmap item for a user-authorized deep private UI scan that visits all selected routes/pages and reports UI defects and bugs. This future page scanner is distinct from the GitHub vulnerability bot being implemented now.

### Branded email delivery and preview recovery

Use one responsive, accessible Clyvro-branded email frame with purpose-specific templates for invitations, password resets, waitlist messages, security alerts, billing/scan/domain notifications and admin SMTP tests. Escape user-controlled text and links, include useful plain-text alternatives, and preserve the durable outbox's deduplication/retry semantics. Team invitations should email immediately, report delivery honestly, and retain the one-time invitation link as a fallback if SMTP fails. The SMTP test is admin-only and may send only to the authenticated admin; its diagnostics must never reveal credentials. Rebuild a new preview from the latest merged `all` branch rather than trying to rehabilitate an obsolete stale-base deployment.

## Project structure

- `src/app/layout.tsx`, `src/components/Nav.tsx`, and `src/components/SiteFooter.tsx` own shared public chrome and route-aware hiding.
- `src/app/app/layout.tsx` and new app-specific sidebar/drawer components own the private workspace shell and navigation.
- `src/app/page.tsx`, `src/app/api/public-stats/route.ts`, and `src/lib/services/public-stats.ts` own anonymized cached homepage aggregates.
- `src/app/app/page.tsx`, `src/components/app/UsageChart.tsx`, and `src/lib/services/audits.ts` own the free scan-usage chart.
- `src/components/LocalDateTime.tsx`, pricing-currency components, and the exchange-rate API own localized display; `src/lib/plans.ts` remains the canonical USD plan catalog.
- `src/app/api/cron/dispatch/route.ts`, `vercel.json`, the schedule service/table, and `/app/schedules` own the single daily dispatcher and organization-scoped monitoring schedules.
- `src/lib/jobs.ts`, scanner checkpoint/state modules, database migrations and tests own bounded resumable work and completed-result reuse.
- New GitHub App authorization/webhook routes, MCP tools, repository scan services, scoped connection/result tables, and report export modules own the customer-facing GitHub security assistant.
- `src/lib/email/templates.ts`, `src/lib/mail.ts`, the durable notification outbox, team-invitation route, and `/admin/email` own branded transactional mail and credential-safe delivery checks.
- `docs/ROADMAP.md` records the future deep private UI/route scan separately from current implementation work.

## Material constraints

Do not send customer code to an external model or scanner without clear authorization and data handling. Do not reuse the current task's GitHub credentials for customer integrations. Do not commit secrets. Do not enable paid billing, payment checkout, external cron services, dollar-spend estimates, or automatic customer-repository pushes without explicit support and approval. Use `legateakanjimusab@gmail.com` as the author email for every commit.
