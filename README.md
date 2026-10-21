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

**Customer cron jobs record the complete server response.** Every run (`cron_job_runs`) stores the status line (`HTTP 503 Service Unavailable`, not just `503`), every response header (cookie values redacted), the first 8 KB of the body, the final URL after redirects, timing, and whether it was a scheduled or manual run; the job keeps its last duration and consecutive-failure count. Workspace → Schedules & cron shows all of it: "Run now" prints what the server answered, and the run history expands into the same status/headers/body view. `GET /api/cron-jobs/:id/runs` returns the history as JSON.

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

## Security (Clyvro Shield)
Clyvro runs its own edge firewall in front of every page and API route (`src/middleware.ts` → `src/lib/shield/`). No third-party WAF, no extra cost, nothing to configure: it derives its internal token from `AUTH_SECRET`.

| Layer | What it does | Enforced |
|---|---|---|
| Honeypot paths | `.env`, `.git/`, `wp-login.php`, `phpMyAdmin`, `cgi-bin`, `backup.zip`, `*.php` … — files Clyvro does not have. One hit = 403 + 24 h ban. | always |
| Attack-tool fingerprints | User-Agents of sqlmap, nikto, nmap, nuclei, masscan, wpscan, acunetix, nessus and friends (not curl/python/Go). 403 + 1 h ban. | always |
| Rate classes (per address) | sign-in/register/reset 30 per 10 min · public scan & waitlist 40 per 10 min · API 400/min · pages 300/min → 429 with `Retry-After`. | always |
| Scored signatures | SQLi, XSS, command injection, traversal, LFI, SSTI, Log4Shell lookups in the path/query (decoded twice). Score ≥ 3 blocks; 1–2 is logged as "suspicious". Query keys that legitimately carry foreign URLs (`url`, `callbackUrl`, `q`…) can only ever be *suspicious* — Clyvro scans other people's sites. | Enforce / Under-attack modes |
| Ban ladder | Signature/honeypot blocks per address in a rolling 24 h: 4 → 15 min, 10 → 1 h, 25 → 24 h, 60 → 7 days. Floods are judged separately and more gently (sampled 429s: ~5 min sustained → 15 min, ~20 min → 1 h) so a runaway script never earns the 24 h rung. Stored in `security_bans`, pushed to the edge within ~10 s. | always |
| Sign-in lockouts | 5 failed passwords in 15 min locks the account 15 min (10 → 1 h); 20 failures from one address bans it 1 h. Same generic error either way. | always |
| CSRF guard | State-changing `/api/*` requests whose `Origin`/`Sec-Fetch-Site` prove they come from another website are refused (403) before any trust or allowlist applies. Webhooks, cron endpoints and Auth.js callbacks are exempt; requests without an `Origin` (curl, servers) are untouched. Never escalates to a ban (the "attacker" is a victim's browser). | always |
| Trusted browsers | Administrators are trusted **by browser, not by address**: opening `/admin` sets a 30-day HMAC cookie (`clyvro_trust`, derived from `AUTH_SECRET`) that bypasses bans, rate limits and signature rules on any network — so a phone switching from Wi-Fi to mobile data never locks the founder out. Admin → Security shows the status, re-issues it, forgets this browser, or **revokes every trusted browser** (one version bump, live at the edge within ~10 s). | — |
| Emergency door | `/emergency` (hidden, `noindex`, not in the sitemap, exempt from Shield blocks) lets a platform admin prove identity with their password **or** `ADMIN_EMERGENCY_KEY` (Google-only accounts), then lifts a ban on their current address, trusts the browser and opens a session. Own counters: 5 failures per address per 15 min close it for that address; 10 password failures per account close the password path (the key path stays open, so nobody can lock the founder out by spamming their email); the normal sign-in lockout never applies here. Every attempt is logged (`rule: emergency`). | always |
| Admin → Security | Mode switch (**Monitor** → **Enforce** → **Under attack** = limits ÷ 4), trusted-browser controls, IP allowlist for fixed addresses/monitors, 24 h stats, top rules/addresses, last 200 events, ban/unban/unlock, manual bans, plain-language rule catalogue. | — |

Modes live in `site_settings` (`shield`); the default is **Monitor**, so signature rules only record "would block" until the founder has reviewed the events and flips Enforce. Privacy: only salted SHA-256 hashes + masked addresses (`102.89.x.x`) are stored; events are pruned after 7 days by the dispatcher. Resilience: the edge keeps a 10 s snapshot of mode/allowlist/bans from `GET /api/shield/status` (token-protected, `no-store`), and every Shield failure is fail-open — it can slow an attacker, never take the site down. Blocked requests are rewritten to `/api/shield/blocked` (JSON for `/api/*`, a minimal HTML page otherwise); monitor-mode hits are reported in the background to `/api/shield/report`.

Honest limits: rate counters live per edge region (a distributed flood is slowed, then banned — not stopped outright), request bodies are validated by each route rather than by Shield, and no firewall makes a site "un-hackable". Researchers: `/.well-known/security.txt` and `/security` (contact `SECURITY_CONTACT_EMAIL`, default `admin.founda@gmail.com`).

### End-to-end smoke test (terminal)
`npm run e2e -- http://localhost:3111` (or any deployment URL) exercises the live HTTP surface: pages + security headers, honeypots → bans, auth rate limit, sign-in + lockout, the emergency door from a banned address, trusted-browser bypass + revocation, the CSRF guard, a cron job against `https://api.github.com/zen` with its full captured response, and a public scan of `https://github.com`. It creates an admin account only if the e-mail is already a platform admin (`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`), one throwaway member and one cron job (deleted afterwards). `E2E_EMERGENCY_KEY` (same value as the server's `ADMIN_EMERGENCY_KEY`) also exercises the key path; `E2E_SKIP_SCAN=1` skips the scan. Addresses are simulated through `x-forwarded-for`, so run it against localhost or a deployment that trusts that header; it is safe to re-run (fresh address block each run).

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
