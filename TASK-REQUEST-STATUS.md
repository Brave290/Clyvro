# Clyvro — full request checklist and handoff

**Date:** 2026-10-20  
**Repository:** `Brave290/Clyvro`  
**Base:** `all`  
**Current branch:** `agent/mobile-dashboard-github`  
**Commit author email required:** `legateakanjimusab@gmail.com`

This checklist consolidates requests from the start of the project and the latest follow-up. A checked item is completed with evidence. Unchecked items remain incomplete or have unvalidated draft code in the current branch.

## Completed and verified

- [x] **Polish the UI and standardize forms.** Sign-in/up, scan, client, project, settings and team forms use the shared design-token form system. The original scan icon/text overlap was reported fixed in PR #8, and unnecessary sway/hover motion was removed.
- [x] **Rebrand modals and custom selectors.** The custom dialogs and selectors use the Clyvro visual style and accessible interaction patterns. Merged in PR #9.
- [x] **Expand website brand colors and provide a reset.** Owners can choose from the expanded report-color palette and restore the default color. Merged in PR #9.
- [x] **Add owner-only bulk project-data deletion.** The owner Danger Zone requires typed confirmation and preserves usage/quota history. Merged in PR #9.
- [x] **Add a privacy-honest cookie notice.** The banner explains essential-cookie behavior and does not enable analytics/advertising tracking. Merged in PR #10.
- [x] **Use region-aware display currency and browser-local scan times.** Pricing uses approximate daily-cached reference conversion while USD remains canonical; timestamps use the browser locale and timezone. Merged in PR #10.
- [x] **Make scanner work resumable within bounded serverless requests.** Saved scans use lease-safe slices; public scans use signed, expiring checkpoints. This avoids depending on one long request and is not an unlimited-timeout promise. Merged in PR #10.
- [x] **Use the selected cost-first daily dispatcher.** Workspace schedules dispatch through one Vercel Cron at 03:00 UTC. No extra cron-job.org polling loop is active, by the user's selected design. The production `CRON_SECRET` is still missing; see open items.
- [x] **Provide a free usage chart.** Workspace users can see scan usage against quota. It is not a dollar-spending tracker; cost data/billing is not active.
- [x] **Replace fake homepage counts with real database totals.** The public stats API returns real anonymous aggregates; the production endpoint returned zero checks/pages/findings at verification rather than fabricated sample counts.
- [x] **Remove the public footer from auth and dashboard routes.** The production release hides it on `/sign-in`, `/sign-up` and `/app/*`; live sign-in was checked.
- [x] **Upgrade the owner workspace to the highest configured Clyvro tier.** Production Neon records `Founda`, owned by `legateakanjimusab@gmail.com`, as `ultra-agency` with no expiry. This is an application entitlement grant, not a paid subscription or charge.
- [x] **Merge Phase 5.** PR #10 merged into `all`; the production deployment reached READY.
- [x] **Add the future deep private UI/route scan to the roadmap.** `docs/ROADMAP.md` now includes Phase 7 for user-authorized all-route UI/bug scanning. That future product scanner is not implemented yet.
- [x] **Capture a 390×844 mobile baseline for all 19 current page-route patterns.** Screenshots and layout metrics are in local `mobile-qa/baseline/`; this is a baseline capture, not a completed audit/fix pass.
- [x] **Record official GitHub/MCP/OSV design constraints.** See `docs/github-security-integration-research.md`.

## Open, partial, or unvalidated

- [ ] **Finish the all-page mobile audit and fix the defects.** The requested scope is the homepage, scan, how-it-works, pricing/legal pages, auth pages, dashboard, clients/client detail, projects, audit report/compare, schedules, settings, team/invite and shared report. Baseline screenshots visibly show workspace top links clipped off-screen and the scan icon overlapping placeholder text. The full audit and all fixes are not complete.
- [ ] **Redesign the signed-in dashboard around a left sidebar.** Desktop needs a persistent left workspace navigation; mobile needs an accessible left drawer with workspace identity, pages, theme and sign-out. Current branch contains an implementation draft in `src/app/app/layout.tsx`, `src/components/Nav.tsx` and `src/components/app/WorkspaceSidebar.tsx`, but it was not built or checked before this handoff.
- [ ] **Keep completed public scans from running again on refresh.** A draft in `src/app/scan/page.tsx` and `src/lib/public-scan-session.ts` intends to restore the saved report from tab storage, remove the deep-link query and require an explicit new-scan action. It has not been verified. Saved project-audit pages already load their stored report and stop polling when terminal.
- [ ] **Configure `CRON_SECRET` in Vercel Production.** The dispatcher code is protected but the checked production environment lacked this variable. Set it securely without exposing it in source control or chat, then verify authorized and unauthorized requests.
- [ ] **Build and activate the customer-facing GitHub MCP security bot.** The branch contains only a draft deterministic scanner core in `src/lib/github/security-scan.ts`; there is not yet a connected GitHub App, organization-scoped installation/repository storage, webhook receiver, authenticated MCP endpoint, pull-request Check Run, real-time in-app notification, or settings UI. GitHub App credentials and installation are needed before live customer use.
- [ ] **Export GitHub security reports as Markdown and PDF.** Reports should be agent-ready. Provide copyable phased remediation, commit and push instructions. Never write to or push a customer repository without explicit approval.
- [ ] **Add a monetary spend tracker only when real billing/cost-metering exists.** Keep the existing free scan-usage chart, but do not show fabricated dollar spend or a fictitious `$0` bill.
- [ ] **Complete authenticated mobile QA using an isolated preview/local account.** Do not create test records in production.
- [ ] **Run the normal tests/typecheck/build and open a PR after the next AI agent reviews the unvalidated drafts.** This handoff commit intentionally skips all validation at the user's instruction. Do not merge untested code.

## Current branch / files

This handoff branch includes request/status and plan documentation, the roadmap item, official integration research, an unverified sidebar/scan-state draft, and a deterministic GitHub scan-engine draft with tests. It intentionally excludes local screenshots, generated pnpm lockfiles, secrets and environment values. No test or build was run for this handoff commit, as requested.
