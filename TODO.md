# Clyvro outcome tracker

## Delivered and verified

- [x] **Standardized forms and steady interactions.** Sign-in/up, scan, clients, projects, settings and team forms use shared tokens and clear labels, helper/error states, focus and busy feedback; the scan-field icon overlap was previously marked fixed and sway animations were removed. PR #8.
- [x] **Rebranded modals/selectors and owner color controls.** Dialogs and custom selectors use Clyvro styling; owners can choose expanded report colors and reset to the default. PR #9.
- [x] **Owner-only project-data deletion.** Typed confirmation protects the Danger Zone; workspace usage history is retained. PR #9.
- [x] **Privacy-honest cookie notice.** Essential-cookie explanation without optional tracking. PR #10.
- [x] **Regional currency and local scan timestamps.** Approximate reference-rate display with daily cache; USD is canonical; dates use browser locale and timezone. PR #10.
- [x] **Bounded resumable scanner.** Saved jobs use lease-safe slices; public scans use HMAC-signed expiring checkpoints. PR #10.
- [x] **Cost-first schedules.** Organization-scoped schedule UI plus one daily Vercel dispatcher at `0 3 * * *`; no second cron-job.org poller. Production `CRON_SECRET` remains open below. PR #10.
- [x] **Free scan-usage chart and real homepage aggregates.** The chart shows scans versus quota, not money. Homepage totals use database aggregates; production returned real zero counts when verified. PR #10.
- [x] **Footer routing, production merge and owner plan.** Footer hidden from auth and dashboard routes; PR #10 merged and deployed READY. Production owner `legateakanjimusab@gmail.com` is `ultra-agency` with no expiry as an entitlement grant, not a paid subscription.
- [x] **Deep private route scanner roadmap entry.** Phase 7 is in `docs/ROADMAP.md`; actual scanner remains future scope.
- [x] **Mobile baseline capture.** Screenshots/metrics were captured for all 19 current route patterns at 390×844. This is not the completed review/fix pass.

## Active outcomes (do not mark complete until verified)

- [ ] **Review and fix every page at mobile size.** Cover homepage, scan flow, how-it-works, pricing, privacy, terms, sign-in, sign-up, dashboard, clients/client detail, project, audit report/compare, schedules, settings, team, invitation and shared report. Baseline visibly shows clipped horizontal workspace links and scan-field icon/placeholder collision.
- [ ] **Workspace-first dashboard shell.** Replace the shared marketing top navigation on `/app/*` with a desktop left sidebar and an accessible mobile drawer containing overview, clients, team, schedules, settings, plan/usage, workspace identity and sign-out. An implementation draft is present on the current branch but is unvalidated.
- [ ] **Completed-scan persistence.** Restore a terminal public scan report on refresh/revisit; do not rerun the `?url=` deep link, duplicate work or charge quota again. Only interrupted work should offer resume. A draft is present but unvalidated.
- [ ] **Production dispatcher secret.** Add `CRON_SECRET` securely to Vercel Production, then verify the dispatcher authenticates requests. Never put the secret in source, logs or chat.
- [ ] **GitHub MCP security assistant, implemented now.** Build GitHub App authorization, organization-scoped installations/repositories, signed webhook handling, bounded vulnerability scans before production, pull-request Check Runs, authenticated MCP tools and prompt user notification. A deterministic scanner-core draft is present; the product integration and live app credentials are not.
- [ ] **Security report and phased remediation.** Download agent-ready Markdown and PDF reports; provide copyable fix/commit/push instructions in phases. Require explicit approval before any customer-repository write or push.
- [ ] **Real monetary spending tracker.** Add only after real billing or cost-metering is active; never fabricate spend.
- [ ] **Mobile authenticated QA.** Use an isolated preview/local account only. Do not create QA data in production.

## Delivery discipline

- [ ] Review current unvalidated branch drafts, run tests/typecheck/build, then open a PR into `all`; merge only after review. Use `legateakanjimusab@gmail.com` for all commits. The current handoff commit intentionally skips all validation at the user's instruction.
