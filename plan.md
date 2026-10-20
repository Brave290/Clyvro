# Clyvro Phase 5 implementation plan

## Scope and approach

The founder has approved the Phase 5 follow-up and selected a cost-first daily dispatcher. Keep the existing Clyvro design system: premium B2B, blue `#2563EB`, clear evidence, low-motion/steady interactions, and mobile-first form treatment. Remove the site footer only on authenticated `/app/*` routes and the `/sign-in` and `/sign-up` pages; keep it on marketing, pricing, and legal routes.

Add a compact homepage cookie notice with an explicit essential-cookies-only choice and a Privacy Policy link. Explain that optional analytics and advertising cookies are not active; do not add tracking or nonessential cookie behavior.

Show real data only. Replace the homepage’s static checker-capability numbers with anonymous database aggregates for completed/partial audits, pages read, and findings. Cache the public aggregate for a day and omit the strip if the database is unavailable; never expose workspace, project, or user identifiers. Add an organization-level free usage chart for all workspace members using actual `usage_events` and the server-enforced plan quota. It reports scans/quota, not monetary spend, because billing and cost metering are not live.

Use the browser’s locale and IANA timezone to format dates in the scanner and app; persist instants in UTC. Add a region-aware, user-selectable display currency for the proposed USD plan amounts only. Convert with a daily cached public reference rate, label it approximate and non-billable, keep USD as the canonical price, provide attribution, and fall back to USD if a rate is unavailable. Do not add checkout, payment, or charge-currency behavior; Phase 6 remains locked.

Add an application-owned schedule manager and one protected Vercel Cron dispatcher that runs daily. Keep user schedules and due times in Neon, store schedule instants in UTC with an IANA timezone for local display, enforce existing plan entitlements and quotas, and make dispatch idempotent. Do not ping Neon merely to keep it awake: allow scale-to-zero. Provide a documented cron-job.org-compatible fallback endpoint, but leave that external service unconfigured and disabled under the chosen cost-first decision. A daily trigger may delay eligible work until its next run; it is not a real-time guarantee.

Make saved scans resilient to serverless limits with database-backed bounded work, lease-safe job claiming/recovery, and persisted progress where feasible. Each invocation must have a finite time/work budget. Preserve the existing SSRF checks, pinned-IP fetching, per-request bounds, robots rules, plan limits, organization scoping, and exactly-once quota charge. A literal infinite request timeout is not a valid promise; the product should resume safely and present partial coverage honestly if a hard safety ceiling is reached.

Do not mutate production billing entitlements until the exact target is clear: “highest plan” could mean a Clyvro workspace entitlement or a Neon subscription/compute tier. Do not grant or claim paid billing while checkout is inactive.

## Project structure

- `src/app/layout.tsx` and a route-aware chrome component own the shared public navigation/footer boundary.
- `src/app/page.tsx`, `src/app/api/public-stats/route.ts`, and `src/lib/services/public-stats.ts` own anonymized, cached homepage aggregates.
- `src/app/app/page.tsx`, `src/components/app/UsageChart.tsx`, and `src/lib/services/audits.ts` own the free organization usage chart.
- `src/components/LocalDateTime.tsx` owns browser-locale and device-timezone rendering for saved scan timestamps.
- `src/app/pricing/page.tsx` and a small pricing-currency client component/API route own approximate display conversion; `src/lib/plans.ts` remains USD canonical.
- `src/app/api/cron/dispatch/route.ts`, `vercel.json`, an organization-scoped schedule service/table, and a schedule UI own daily scheduled work. `CRON_SECRET` protects the dispatcher.
- `src/lib/jobs.ts`, scanner checkpoint/state modules, Drizzle migrations, and integration tests own bounded, resumable scans.

No charting package is needed; build the usage chart with accessible HTML/CSS. No new paid service or persistent worker is introduced.
