# Clyvro outcome tracker

## Delivered and verified

- [x] **Standardized forms and steady interactions.** Sign-in/up, scan, clients, projects, settings and team forms use shared tokens and clear labels, helper/error states, focus and busy feedback; the scan-field icon overlap was previously marked fixed and sway animations were removed. PR #8.
- [x] **Rebranded modals/selectors and owner color controls.** Dialogs and custom selectors use Clyvro styling; owners can choose expanded report colors and reset to the default. PR #9.
- [x] **Owner-only project-data deletion.** Typed confirmation protects the Danger Zone; workspace usage history is retained. PR #9.
- [x] **Privacy-honest cookie notice.** Essential-cookie explanation without optional tracking. PR #10.
- [x] **Regional currency and local scan timestamps.** Approximate reference-rate display with daily cache; USD is canonical; dates use browser locale and timezone. PR #10.
- [x] **Bounded resumable scanner.** Saved jobs use lease-safe slices; public scans use HMAC-signed expiring checkpoints. PR #10.
- [x] **Cost-first schedules.** Organization-scoped schedule UI plus one daily Vercel dispatcher at `0 3 * * *`; no second cron-job.org poller. PR #10.
- [x] **Free scan-usage chart.** The chart shows scans versus quota, not money. PR #10.
- [x] **Footer routing, production merge and owner plan.** Footer hidden from auth and dashboard routes; PR #10 merged and deployed READY. Production owner `legateakanjimusab@gmail.com` is `ultra-agency` with no expiry as an entitlement grant, not a paid subscription.
- [x] **Deep private route scanner roadmap entry.** Phase 7 is in `docs/ROADMAP.md`; actual scanner remains future scope.
- [x] **Mobile baseline capture.** Screenshots/metrics were captured for all 19 current route patterns at 390×844. This is not the completed review/fix pass.
- [x] **Honest homepage totals.** Finished anonymous public scans are recorded exactly-once (`public_scans`, deterministic key — a retried final slice cannot double-count) and summed with completed/partial workspace audits; failed scans never count. Fixed the component/API key drift that rendered `NaN`. Verified E2E: one public scan + one saved audit → `{checks: 2, pages: 20, findings: 2}`. 2026-10-20.
- [x] **Visible scan-depth distinction.** RunAuditForm has a Normal/Strict picker; mode persists on `audits.scanMode` and shows as a badge on the report. Same scoring both modes. Verified E2E on github.com: Strict = depth 3, 166 links checked; Normal = depth 2, ≤20 links. 2026-10-20.
- [x] **Saved scans drain to completion in production.** The audit page's polling nudges bounded slice work after each response; previously a deep scan sat "running" until the next day's cron because the in-process worker is dev-only. Daily dispatcher drains 12 slices. Verified E2E: a stuck Strict audit resumed and completed in ~83s of polling. 2026-10-20.
- [x] **Workspace-first dashboard shell.** Standard SaaS shell on `/app/*`: fixed desktop sidebar (workspace card + switcher, grouped nav, usage meter, user footer, sign-out), mobile top bar + accessible drawer (focus trap, Escape, scroll lock, valid `w-[85vw] max-w-80` — the previous draft's invalid `w-[min(86vw,twentyrem)]` is gone). All `/app` pages verified 200 authenticated. 2026-10-20.
- [x] **Production dispatcher secret.** `CRON_SECRET` set in Vercel Production (sensitive) on 2026-10-20; the value exists only in Vercel. Dispatcher auth verified locally (401 no-auth/bad secret, 200 good secret); production endpoint re-checked after deploy.

## Active outcomes (do not mark complete until verified)

- [ ] **Review and fix every page at mobile size.** Dashboard shell replaced (above); the full 390×844 pass across homepage, scan flow, how-it-works, pricing, privacy, terms, sign-in, sign-up, clients/client detail, project, audit report/compare, schedules, settings, team, invitation and shared report is still open.
- [ ] **Completed-scan persistence.** Restore a terminal public scan report on refresh/revisit; do not rerun the `?url=` deep link, duplicate work or charge quota again. Only interrupted work should offer resume. Implementation is unit-validated (PR #12); browser refresh verification at phone size still open.
- [ ] **GitHub MCP security assistant, implemented now.** Build GitHub App authorization, organization-scoped installations/repositories, signed webhook handling, bounded vulnerability scans before production, pull-request Check Runs, authenticated MCP tools and prompt user notification. A deterministic scanner-core draft is present; the product integration and live app credentials are not.
- [ ] **Security report and phased remediation.** Download agent-ready Markdown and PDF reports; provide copyable fix/commit/push instructions in phases. Require explicit approval before any customer-repository write or push.
- [ ] **Real monetary spending tracker.** Add only after real billing or cost-metering is active; never fabricate spend.
- [ ] **Mobile authenticated QA.** Use an isolated preview/local account only. Do not create QA data in production.

## Delivery discipline

- [x] Agent handoff draft `2100bf8` was validated (5 defects fixed), tested, and merged via PR #12 (`c5a7de3`). Since then: full gates (typecheck/lint/140 tests/build) run before every PR into `all`; merge only with green checks. All commits use `legateakanjimusab@gmail.com`.
