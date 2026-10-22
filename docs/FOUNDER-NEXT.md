# What you need to do — and what is not finished

Last reviewed 2026-10-22. This is the honest list across the live product, docs, env, and code. Nothing here is “done” until you have seen it work on `clyvro.vercel.app`.

## Do these yourself (dashboards / keys)

1. **Redeploy this PR** on Vercel (`all`). Migration `0027_billing_auto_renew` adds auto-renew columns; it is additive.
2. **Flutterwave checkout (Visa + Verve).** After deploy, pay once in NGN from Lagos. Confirm ₦ prices, card form, receipt email, plan grant. If you still see *Invalid charge request*:
   - Dashboard → checksum: we now send `payload_hash`. If checksum is on, it must stay on.
   - Settlement / subaccount: creating an `RS_…` subaccount does **not** move money. Set `FLUTTERWAVE_SUBACCOUNT_ID` in Vercel. The bank-account **legal name** must match Flutterwave KYC — not a brand name.
3. **Webhook URL** in Flutterwave: `https://clyvro.vercel.app/api/billing/webhook` with the same `FLUTTERWAVE_WEBHOOK_SECRET`. Recurring months will not extend the plan without this.
4. **Auto-renew smoke test.** On Billing, tick **Renew automatically each month**, pay. Confirm “Auto-renew is on”. Wait for (or trigger) a Flutterwave test subscription charge and confirm days remaining go up, not reset. Then **Turn auto-renew off** and confirm Flutterwave stops charging.
5. **Firebase Google sign-in.** Console → Authentication → Google enabled; authorized domains `clyvro.vercel.app` + `localhost`; `NEXT_PUBLIC_FIREBASE_*` in Vercel; one live Google sign-in.
6. **SMTP.** `SMTP_*` + `EMAIL_FROM`. Admin → Email test to yourself. Then: password reset, invitation, payment receipt, plan-expiry mail.
7. **cron-job.org (no secret).** Job 1: `GET https://clyvro.vercel.app/api/cron/tick` every 10 min. Job 2: `GET https://clyvro.vercel.app/api/cron/health` every 15 min, alerts on. Vercel Cron already hits `/api/cron/dispatch` daily with `CRON_SECRET`.
8. **Shield.** Admin → Security is **Monitor** until you switch to **Enforce**. Watch events a few days first. Under-attack still has no proof-of-work challenge.
9. **R2 backups** (optional until you need them): `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Without them, Admin → Backup & Restore cannot store archives.
10. **GitHub App for Code Reviewer — do not turn this on yet.** The in-app Code Reviewer is **Coming soon** (inactive button, paste-check removed). When you are ready: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, setup URL `/app/code-reviewer/github-setup`, webhook `/api/github/webhook`. Then we take the Coming soon label off.
11. **Deep scans of your own domain.** `vercel.app` cannot take a TXT record. Use the meta-tag proof on the homepage, or verify a domain you control.
12. **Admin emergency key.** Confirm `/emergency` still works with `ADMIN_EMERGENCY_KEY` after this deploy. Trust this browser on each device you use for `/admin`.

## Built in code, not “done” until you verify live

- Card checkout (Inline, NGN when any signal is Nigeria, `payload_hash`, 3DS redirect, optional subaccount).
- Auto-renew: Flutterwave Payment Plans created per plan+currency, `payment_plan` on Inline/HTML, webhook applies later months, toggle off cancels subscriptions. **Turning on always happens at checkout** (we need a card).
- Plan expiry emails (7 days, 1 day, ended).
- Restore default prices in Admin → Billing (and per-plan Restore amounts). Editing one currency scales the others.
- Renewal button copy: more than 3 days left → “Pay for next month”; 3 days or fewer → “Renew / extend a month”. Prepay extends from current expiry.
- Homepage waitlist removed (sign-up CTA). `/api/waitlist` still exists.
- Signup is three short steps. Login/signup cards sit higher and shorter.
- Footer is a compact Product / Company / Legal strip (no second BETA lockup, no long product dump).
- Code Reviewer: Coming soon label + disabled button. Quick paste check **removed**.

## Not built / not finished (do not treat as live)

### Billing & money
- Flutterwave **Payment Plans / auto-renew** is new — not production-verified.
- Recurring webhook has never been seen against the live merchant.
- Standard hosted `flwlnk` links still 500 — we must not mint them.
- No PDF invoices. Receipt is email + Billing history.
- No real monetary spending tracker (and we will not invent spend).
- Country picker stays gone on purpose.

### Auth & security
- TOTP 2FA for admin accounts — not built.
- Session list / revoke — not built.
- New-device sign-in email — not built.
- In-house proof-of-work for Under-attack mode — not built.
- Shield **Enforce** is a founder switch, not the default.
- Failed preview recovery / stale-base Vercel preview — still open in TODO.

### Code Reviewer & GitHub
- In-app Code Reviewer is **Coming soon**. Paste check is gone. GitHub bot UI is hidden until you ship credentials and we flip the flag.
- GitHub MCP security assistant / PR Check Runs / authenticated MCP tools — research + scanner core only; not a product.
- Security report → agent-ready Markdown/PDF with copyable commit/push, gated on explicit approval — not built.

### Scanner / product
- Phase 7 deep **private / authenticated** UI and route scan — roadmap only.
- Playwright Flow Scan is live in-app but environment-sensitive (Chromium on Vercel). Treat failures as infra, not “the site is fine”.
- Full Scan is Pro/Agency unlimited (strict security on verified domains). Site API + Site Guard: Pro/Agency only. Other plans have no API.
- Public scan report persistence on refresh is unit-tested; phone-size browser verification still open.
- Mobile 390×844 review/fix pass across marketing + app pages — still open.
- Cron engine v2 + always-on Runner VM (Oracle/GCP) — not built. Today: Vercel Cron + public tick + in-app HTTP jobs.

### Email / ops
- SMTP not confirmed delivering in production (outbox records `skipped_no_mailer` without keys).
- Invitation email sends when SMTP is on; copy-link fallback remains.
- Waitlist form is not on the homepage anymore; the API remains.

### Commercial launch (Phase 6 exit)
- Production-readiness checklist including tested SSRF in production egress — partially done, not signed off.
- Paid-pilot / go-live announcement — not done.
- Beta badge is still on the public nav. Changelog rule: we do not list unfinished work as shipped.

## Pages that exist live (sanity)

Public: `/` `/scan` `/how-it-works` `/pricing` `/privacy` `/terms` `/refund-policy` `/security` `/changelog` `/feature-requests` `/sign-in` `/sign-up` `/forgot-password` `/flow-scan` (marketing).

App (signed-in): Scan, Overview, Clients, Readiness, AI-Pattern, Flow Scan, Full Scan, Hack Protection, SEO Visibility, **Code Reviewer (Coming soon)**, five Developer Tools, Schedules & cron, Team, Billing, Feature requests, Settings.

Admin: Overview, Users, Workspaces, Jobs, Legal, Changelog, Cron, Email, Billing catalog, Security, Backups, Maintenance, Audit log, Feature-request triage.

## What this PR changed in the product UI

- Code Reviewer: Coming soon + inactive button; **Quick paste check removed** (the form in your screenshot).
- Footer: shorter, no duplicate BETA block, fewer links, email next to the mark.
- Sign-up: Email → Password → Name/workspace. Login/sign-up no longer sit so far down the screen.
- Billing: auto-renew checkbox at checkout; turn-off when live.

Say **pull and merge** when you want this on `all`.
