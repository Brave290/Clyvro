# What you need to do — and what is not finished

Last reviewed 2026-10-22. The long technical handoff (engines, tests, next-agent reverify) is `docs/PROJECT-HANDOFF.md`. This page is **your** checklist. Nothing is “done” until you have seen it on `clyvro.vercel.app`.

## Do these yourself (dashboards / keys)

1. **Redeploy `all`.** Latest includes Full Scan + Site API and migration **`0028_org_api_keys`** (additive). Also **`0027_billing_auto_renew`**.
2. **Flutterwave checkout (Visa + Verve).** Pay once in NGN from Lagos. Confirm ₦ prices, card form, receipt email, plan grant. If *Invalid charge request*:
   - Dashboard checksum: we send `payload_hash`. If checksum is on, it must stay on.
   - `FLUTTERWAVE_SUBACCOUNT_ID` if you use a subaccount. Bank **legal name** must match KYC.
3. **Webhook:** `https://clyvro.vercel.app/api/billing/webhook` with `FLUTTERWAVE_WEBHOOK_SECRET`. Recurring months will not extend the plan without this.
4. **Auto-renew smoke.** Billing → Renew automatically → pay. Confirm “Auto-renew is on”. A test subscription charge should add days, not reset. Turn off and confirm Flutterwave stops.
5. **Firebase Google sign-in.** Google enabled; authorized domains `clyvro.vercel.app` + `localhost`; `NEXT_PUBLIC_FIREBASE_*` in Vercel.
6. **SMTP.** `SMTP_*` + `EMAIL_FROM`. Admin → Email test. Then reset / invite / receipt / expiry mail.
7. **cron-job.org (no secret).** `GET /api/cron/tick` every 10 min. `GET /api/cron/health` every 15 min. Vercel Cron already hits `/api/cron/dispatch` daily with `CRON_SECRET`.
8. **Shield.** Admin → Security stays **Monitor** until you switch **Enforce**. Watch events first. Under-attack has no proof-of-work yet.
9. **R2 backups** (optional): `R2_*`. Without them, Admin → Backup cannot store archives.
10. **GitHub App for Code Reviewer — leave off.** Coming soon. When you are ready: `GITHUB_APP_*`, setup `/app/code-reviewer/github-setup`, webhook `/api/github/webhook`.
11. **Verify `clyvro.vercel.app`.** No TXT on `vercel.app` — use the homepage **meta tag**. Then Full Scan / Deep Scan can include hidden paths.
12. **Emergency key.** `/emergency` + `ADMIN_EMERGENCY_KEY`. Trust this browser on each admin device.
13. **Pro API key.** Sidebar → **API & keys** → create `cly_…`. Copy once. Try the curls (and **Copy all**) on `/docs/api`.
14. **Watch a Flow Scan.** You should see the **real page picture** in the browser chrome while it walks (not only a text log). If the picture never lands, the step log will say the browser could not start — that is infra (`PLAYWRIGHT_WS_ENDPOINT` or bundled Chromium), not “the site is fine”.

## Built in code, not “done” until you verify live

- Full Scan = five engines, Pro/Agency **unlimited**, strict security on verified domains. Live Chromium pane on the Flow stage.
- Deep Scan uses verification to crawl hidden/admin and robots-disallowed URLs. Live crawl chrome shows the URL actually being fetched.
- Site API + Site Guard, Pro/Agency only. Keys: `/app/api-keys`. Docs: `/docs/api` (Copy all).
- Card checkout (Inline, NGN when any signal is Nigeria, `payload_hash`, 3DS, optional subaccount).
- Auto-renew code (Payment Plans, webhook later months). **Not production-verified.**
- Signup is three short steps. Footer is the compact Product / Company / Legal strip.
- Code Reviewer: Coming soon + inactive button. Quick paste check **removed**.

## Not built / not finished

- Flutterwave recurring webhook never seen on the live merchant. Do **not** mint Standard `flwlnk` links (HTTP 500). Do **not** retry USD-on-NG.
- Country picker stays gone. Charge NGN if any signal is NG.
- TOTP 2FA, session list, new-device email — not built.
- Phase 7 private/authenticated crawl — not built.
- In-app Code Reviewer — Coming soon.
- SMTP not confirmed in production.
- Paid-pilot / go-live announcement — not done. Beta badge stays until you say otherwise.
- Do not change **Download as report** (`ReportExportBar` / `ExportBar`).

## Pages (sanity)

Public: `/` `/scan` `/how-it-works` `/pricing` `/privacy` `/terms` `/refund-policy` `/security` `/changelog` `/feature-requests` `/docs/api` `/sign-in` `/sign-up` `/flow-scan`.

App: Scan, Overview, Clients, Readiness, AI-Pattern, Flow Scan, Full Scan, API & keys, Hack Protection, SEO, Code Reviewer (Coming soon), Dev Tools, Schedules, Team, Billing, Feature requests, Settings.

Admin: Overview, Users, Workspaces, Jobs, Legal, Changelog, Cron, Email, Billing catalog, Security, Backups, Maintenance, Audit log, Feature-request triage.
