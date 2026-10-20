# Clyvro — Find the friction. Fix the conversion.

Evidence-first website auditing SaaS for freelancers, web design agencies, SEO consultants, and small businesses. Currently in **Beta**. Visitors get one free anonymous check at `/scan`. Signed-in users run saved scans (Normal / Strict / DNS-verified Deep), track fixes, compare runs, share branded reports, schedule monitoring, run their own HTTP cron jobs, check Project Readiness, and invite teammates with owner/admin/member/viewer roles — all with server-enforced plan limits. All data shown is real; there is no sample/demo data anywhere on the site. See `docs/PHASE-STATUS.md` for the build tracker.

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000  → open /scan
```
No environment variables are required locally (an embedded database is used; data lives in `.data/`). For production set `DATABASE_URL` (Neon Postgres) and `AUTH_SECRET`. Everything optional is documented in `.env.example`.

## Production setup (Vercel + Neon)

1. **Database (Neon).** Create/confirm the Neon project, set `DATABASE_URL` (pooled) in Vercel Production. Migrations in `drizzle/` run automatically on first database use; to run them ahead of a deploy: `npm run db:migrate` with `DATABASE_URL` set. Verify connectivity at `GET /api/cron/health` with the cron secret (below) — it performs a real bounded database read and reports queue depth.
2. **Auth.** Set `AUTH_SECRET` (`openssl rand -base64 32`). See "Neon Auth" below for Google sign-in.
3. **Dispatcher secret.** Set `CRON_SECRET` (`openssl rand -hex 32`) in Vercel Production. Vercel Cron calls `/api/cron/dispatch` daily (see `vercel.json`). To advance scans more often, use Cron-job.org (below).
4. **Payments (Flutterwave).** Set `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`, and `FLUTTERWAVE_WEBHOOK_SECRET` (the "secret hash" from the Flutterwave dashboard). In the Flutterwave dashboard, set the webhook URL to `https://YOUR-DOMAIN/api/billing/webhook`. Amounts are computed server-side from fixed per-currency prices; the webhook secret is verified and every transaction is re-verified against the Flutterwave API before a 30-day plan grant is applied (idempotently). Without the keys, Billing honestly shows "payments aren't switched on yet" and no checkout can happen.
5. **Email (SMTP).** Set `SMTP_URL` (or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`) and `EMAIL_FROM`. Used for password resets, scan/billing notifications, waitlist confirmations, and invitations via the durable outbox (`notification_outbox`; deduped per event, flushed by the dispatcher). Without it, events are recorded as `skipped_no_mailer` — never claimed sent.
6. **Owner + admin.** The founder account (`legateakanjimusab@gmail.com`, override with `CLYVRO_OWNER_EMAILS`) is granted **Ultra Agency for life** (no expiry; never degraded) and platform-admin access (`CLYVRO_ADMIN_EMAILS` for additional admins). Admins get `/admin` (Admin Control Center): users, workspaces, plan overrides (labelled, distinct from purchases), jobs, legal pages, audit log.

### Neon Auth (Google sign-in)
Google sign-in runs through **Neon Auth (Managed Better Auth)** so credentials live in the Neon Console, not Vercel:
1. In the Neon Console: Project → Branch → **Auth** → Enable Auth. The Neon Vercel integration already provides `NEON_AUTH_BASE_URL`. Also add `NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`) in Vercel.
2. In the Neon Console Auth settings, add this app's origin as a **trusted domain**.
3. Google works immediately with Neon's shared development credentials. For production, create your own Google OAuth app and add its Client ID/Secret **in the Neon Console**; register the authorized redirect URI `{NEON_AUTH_BASE_URL}/callback/google` in Google Cloud Console.
4. The app proxies Neon Auth at `/api/neon-auth/*`, verifies the session server-side at `/api/auth/neon-bridge`, links by verified email to the existing account/workspace, and exchanges it for the normal app session. Email/password (Auth.js) remains as the fallback until the Neon path is verified live; existing password hashes are untouched (Auth.js scrypt hashes cannot be imported into Better Auth — users who prefer can keep email sign-in or use the existing password-reset flow). Rollback: remove `NEON_AUTH_BASE_URL`.
5. Which methods are live is always visible at `GET /api/auth/providers-status`, and the sign-in page says plainly when Google isn't switched on yet.

Note: the official `@neondatabase/auth` SDK (0.4–0.6 beta) declares `next >= 16`; this app runs Next 15, so the integration uses the SDK-free proxy in `src/app/api/neon-auth/[...path]` until a Next upgrade makes the SDK installable.

### Cron-job.org (optional external pinger)
Vercel's daily cron plus in-app activity already advance work; Cron-job.org makes deep scans finish faster and monitors health:
1. **Health check:** `GET https://YOUR-DOMAIN/api/cron/health` every 5–15 minutes. No credentials needed for liveness (`{"status":"ok"}`); add header `Authorization: Bearer YOUR_CRON_SECRET` to also get database diagnostics. A failing check returns 503.
2. **Work dispatcher (optional):** `GET https://YOUR-DOMAIN/api/cron/dispatch` with header `Authorization: Bearer YOUR_CRON_SECRET`, every 5–30 minutes, timeout 60s+. It only advances already-queued, bounded work — it cannot start arbitrary scans.
3. Verify in Cron-job.org's execution log (expect HTTP 200). Investigate failures: 401 = secret mismatch, 503 = `CRON_SECRET` not set in Vercel or database unreachable.
4. Rotating the secret: set the new `CRON_SECRET` in Vercel, redeploy, then update Cron-job.org jobs; old-secret requests start returning 401.
5. Important: a health ping does **not** keep a Neon compute awake or prevent scale-to-zero; Neon compute wakes on real queries (connection attempts from the app/dispatcher). Health checks report status; they don't change Neon's scaling behaviour.

### DNS domain verification (deep scans)
Deep scans require proof of domain control: Scan tab → Deep → **Verify this domain**. Add the shown TXT record at `_clyvro-verify.<domain>`, then "Check now". Only a server-side DNS match verifies (token stored as SHA-256; 7-day expiry; rate-limited checks). Verification never weakens SSRF protection — targets are still validated and IP-pinned per request.

### Deployment, rollback, troubleshooting
- Deploy: merge to `all` (Vercel production branch). Migrations apply on first DB use; they are additive.
- Rollback: redeploy the previous commit in Vercel. Schema changes in this release are additive columns/tables; older code ignores them. No destructive migration exists.
- Scan stuck? Scans now always reach a terminal state: max 2h end-to-end (configurable `SCAN_JOB_MAX_DURATION_MS`), then `timed_out` (free, progress preserved). Check `/admin` → Scan jobs for attempts/errors.
- Billing not charging? `GET /api/billing` shows `configured:false` until Flutterwave keys exist. Webhook replays are safe (idempotent claim).
- Google button shows a notice? `GET /api/auth/providers-status` shows which provider is configured; complete the Neon Auth steps above.

## Scanner safety model (summary)
Every submitted/redirected/discovered URL is validated before any connection: http/https only, no credentials, default ports, public-IP range checks over DNS results (private/loopback/link-local/metadata addresses blocked for IPv4+IPv6 and transition embeddings), connections pinned to the validated IP to defeat DNS rebinding, manual redirect handling with re-validation, strict page/depth/size/time budgets, robots.txt respected, forms never submitted. Details: `docs/ARCHITECTURE.md`, implementation: `src/lib/scanner/`. Only scan sites you own or are authorized to assess.

## Verify
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Tests cover SSRF attacks, fetcher limits, the ruleset, crawl bounds, resumable jobs (timeout/cancel/retry/stale-lease), DNS verification, quotas under concurrency, billing idempotency, Neon bridge tokens, notifications dedupe, admin authorization, and legal publishing.

## Documentation
- `docs/PRODUCT-CONTEXT.md` — canonical product context (positioning, honesty rules, phase plan)
- `docs/ARCHITECTURE.md` — stack, scanner pipeline, security model
- `docs/ROADMAP.md` — phases and exit criteria
- `docs/PHASE-STATUS.md` — build tracker (source of truth across sessions)
- `TODO.md` — open follow-ups (incl. founder credential steps)

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind CSS 4 · Lucide icons · undici (pinned-IP fetching) · node-html-parser · Neon Postgres + Drizzle ORM (embedded PGlite fallback with identical migrations for zero-config local runs) · Auth.js credentials + Neon Auth (Managed Better Auth) bridge · DB-backed resumable scan jobs (leases, heartbeats, bounded retries, idempotent usage) · Flutterwave billing (server-verified, idempotent).
