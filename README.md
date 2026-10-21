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
2. **Auth.** Set `AUTH_SECRET` (`openssl rand -base64 32`). See "Firebase Authentication" below for Google sign-in.
3. **Dispatcher secret.** Set `CRON_SECRET` (`openssl rand -hex 32`) in Vercel Production. Vercel Cron calls `/api/cron/dispatch` daily (see `vercel.json`) and attaches `Authorization: Bearer $CRON_SECRET` by itself from that variable — nothing to configure in the Vercel dashboard. Outside schedulers do not need the secret at all: point them at the public `/api/cron/tick` (below). The full endpoint reference with copy-ready URLs lives in Admin → Cron.
4. **Payments (Flutterwave).** Set `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`, and `FLUTTERWAVE_WEBHOOK_SECRET` (the "secret hash" from the Flutterwave dashboard). In the Flutterwave dashboard, set the webhook URL to `https://YOUR-DOMAIN/api/billing/webhook`. Amounts are computed server-side from fixed per-currency prices; the webhook secret is verified and every transaction is re-verified against the Flutterwave API before a 30-day plan grant is applied (idempotently). Without the keys, Billing honestly shows "payments aren't switched on yet" and no checkout can happen.
5. **Email (SMTP).** Set `SMTP_URL` (or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`) and `EMAIL_FROM`. Used for password resets, scan/billing notifications, waitlist confirmations, and invitations via the durable outbox (`notification_outbox`; deduped per event, flushed by the dispatcher). Without it, events are recorded as `skipped_no_mailer` — never claimed sent.
6. **Owner + admin.** The founder account (`legateakanjimusab@gmail.com`, override with `CLYVRO_OWNER_EMAILS`) is granted **Ultra Agency for life** (no expiry; never degraded) and platform-admin access (`CLYVRO_ADMIN_EMAILS` for additional admins). Admins get `/admin` (Admin Control Center): users, workspaces, plan overrides (labelled, distinct from purchases), jobs, legal pages, audit log.

### Firebase Authentication (Google sign-in)
Google sign-in runs through **Firebase Authentication** (founder decision; Neon hosts only the Postgres database):
1. In the Firebase Console: **Authentication → Sign-in method → Google → Enable** (pick the support email when asked).
2. **Authentication → Settings → Authorized domains**: add the production domain (`clyvro.vercel.app`) and keep `localhost` for development. Without this, Firebase rejects the popup with `auth/unauthorized-domain`.
3. **Project settings → Your apps → Web**: register the app (or open the existing one) and copy the web config into Vercel as `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` (plus `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` / `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` when present). These web-config values are public by design — security comes from server-side token verification. Optionally set `FIREBASE_PROJECT_ID` server-side (falls back to the public project id).
4. Redeploy. The browser runs Firebase's Google popup; the Firebase ID token is verified server-side (`/api/auth/firebase-bridge`, Google securetoken JWKS + `iss`/`aud` for this project), the account is linked by verified email to the existing workspace, and the normal Auth.js app session is minted. Email/password (Auth.js) is untouched and keeps working either way. Rollback: remove the `NEXT_PUBLIC_FIREBASE_*` variables.
5. Which methods are live is always visible at `GET /api/auth/providers-status`, and the sign-in page says plainly when Google isn't switched on yet.
6. No CSP step is needed: the site's Content-Security-Policy (`src/lib/csp.ts`) already admits what Firebase's popup flow loads into the page — Google's `gapi` loader (`script-src https://apis.google.com`) and the auth-domain relay iframe (`frame-src https://*.firebaseapp.com https://accounts.google.com`). A custom `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (e.g. `auth.example.com`) is added to `frame-src` automatically.

### Cron-job.org (external scheduler — no secret needed)
Vercel's daily cron plus in-app activity already advance work; an outside scheduler makes emails, schedules and deep scans finish within minutes instead of hours, and monitors health. Three endpoints, three jobs:

| Endpoint | What it is | Auth | Suggested use |
|---|---|---|---|
| `GET /api/cron/health` | A thermometer: "is the site up?" Does no work. Public reply is `{"status":"ok"}`; with `Authorization: Bearer CRON_SECRET` it also performs one bounded database read and reports queue depth (the "database ping"). Never advances scans, never sends email, does not keep Neon awake. | none (secret optional) | every 15 min, failure alerts on; 503 = database unreachable |
| `GET /api/cron/tick` | A doorbell: "do your pending work now" **without a secret**. Safe to be public: it only runs the same bounded dispatcher pass as Dispatch, at most once every 5 minutes platform-wide (atomic database claim — extra calls answer `ran:false` and start nothing), with a per-address flood limit, and it returns no data. | none by design | every 10 min from cron-job.org, no headers |
| `GET /api/cron/dispatch` | The worker behind a key: same pass, no cooldown. Vercel Cron calls it daily with the bearer header added automatically. | `Authorization: Bearer CRON_SECRET` (401 otherwise) | leave to Vercel Cron and the Admin "Run dispatcher now" button |

One dispatcher pass, in order: queue due scan schedules → plan housekeeping → customers' due cron jobs (their URLs, SSRF-guarded) → time out stuck jobs → queued scan slices (bounded, ~4 min max) → up to 30 queued emails from the outbox.

Setup on cron-job.org: Job 1 `https://YOUR-DOMAIN/api/cron/tick` every 10 minutes; Job 2 `https://YOUR-DOMAIN/api/cron/health` every 15 minutes with notifications on. No headers on either. Expect HTTP 200 (`ran:true` or `ran:false`/`cooldown` are both success for the tick). Rotating `CRON_SECRET` (Vercel → redeploy) does not affect these two jobs. Health pings do **not** keep a Neon compute awake; the tick is what advances queued work.

### DNS domain verification (deep scans)
Deep scans require proof of domain control: Scan tab → Deep → **Verify this domain**. Add the shown TXT record at `_clyvro-verify.<domain>`, then "Check now". Only a server-side DNS match verifies (token stored as SHA-256; 7-day expiry; rate-limited checks). Verification never weakens SSRF protection — targets are still validated and IP-pinned per request.

### Deployment, rollback, troubleshooting
- Deploy: merge to `all` (Vercel production branch). Migrations apply on first DB use; they are additive.
- Rollback: redeploy the previous commit in Vercel. Schema changes in this release are additive columns/tables; older code ignores them. No destructive migration exists.
- Scan stuck? Scans now always reach a terminal state: max 2h end-to-end (configurable `SCAN_JOB_MAX_DURATION_MS`), then `timed_out` (free, progress preserved). Check `/admin` → Scan jobs for attempts/errors.
- Billing not charging? `GET /api/billing` shows `configured:false` until Flutterwave keys exist. Webhook replays are safe (idempotent claim).
- Google button shows a notice? `GET /api/auth/providers-status` shows which provider is configured; complete the Firebase steps above.
- Google sign-in fails with a notice? The notice names the cause and the fix (Firebase code included for owner-side problems: provider not enabled, domain not authorised, config rejected, loader/iframe blocked by a content blocker or CSP); the full error is also logged to the browser console as `[GoogleButton]`. If it says the Content-Security-Policy blocked something, `src/lib/csp.ts` is the place to look.

## Scanner safety model (summary)
Every submitted/redirected/discovered URL is validated before any connection: http/https only, no credentials, default ports, public-IP range checks over DNS results (private/loopback/link-local/metadata addresses blocked for IPv4+IPv6 and transition embeddings), connections pinned to the validated IP to defeat DNS rebinding, manual redirect handling with re-validation, strict page/depth/size/time budgets, robots.txt respected, forms never submitted. Details: `docs/ARCHITECTURE.md`, implementation: `src/lib/scanner/`. Only scan sites you own or are authorized to assess.

## Verify
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Tests cover SSRF attacks, fetcher limits, the ruleset, crawl bounds, resumable jobs (timeout/cancel/retry/stale-lease), DNS verification, quotas under concurrency, billing idempotency, Firebase bridge tokens, notifications dedupe, admin authorization, and legal publishing.

## Documentation
- `docs/PRODUCT-CONTEXT.md` — canonical product context (positioning, honesty rules, phase plan)
- `docs/ARCHITECTURE.md` — stack, scanner pipeline, security model
- `docs/ROADMAP.md` — phases and exit criteria
- `docs/PHASE-STATUS.md` — build tracker (source of truth across sessions)
- `TODO.md` — open follow-ups (incl. founder credential steps)

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind CSS 4 · Lucide icons · undici (pinned-IP fetching) · node-html-parser · Neon Postgres + Drizzle ORM (embedded PGlite fallback with identical migrations for zero-config local runs) · Auth.js credentials + Firebase Authentication (Google) bridge · DB-backed resumable scan jobs (leases, heartbeats, bounded retries, idempotent usage) · Flutterwave billing (server-verified, idempotent).
