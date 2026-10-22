# Vercel Test Keys — Clyvro (replace before production)

> These are **TEST placeholders** so Vercel stops complaining about missing env vars.
> They let the app boot and let you click-through locally.
> **Replace each `TEST_…` / `REPLACE_ME` with a real value before you go live.**
> Nothing in this file is committed as a real secret — generate real ones with the commands shown.

Generated on: 2026-10-22 (Africa/Lagos) — branch `arena/98a5c54d-clyvro`
Project: `clyvro` (prj_G5CKlOKmsL9bzbQqlap3EYk6jMTt) — https://clyvro.vercel.app

## How to use in Vercel
1. Vercel Dashboard → pick project `clyvro` → **Settings → Environment Variables**
2. For each row below, click **Add** → paste **Key** + **Value** → pick **Environment: Production + Preview + Development** (unless noted) → Save.
3. After saving, **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the new vars take effect.
4. Then replace the `TEST_…` values with real ones from the right-hand “Where to get real value” column.

To generate a fresh random secret yourself (recommended for the 3 security keys):

```bash
# AUTH_SECRET (base64 32 bytes)
openssl rand -base64 32

# CRON_SECRET (hex 32 bytes)
openssl rand -hex 32

# ADMIN_EMERGENCY_KEY (base64 32 bytes)
openssl rand -base64 32
```

---

## 1) Security / Auth — set these first (app still runs without them, but auth + cron will be degraded)

| Key | Test Value (paste as-is, then replace) | Type in Vercel | Where to get real value |
|-----|----------------------------------------|----------------|------------------------|
| `AUTH_SECRET` | `Tm9/NbQpDKlcqG5Q7ZdKTAWETMtNq30ql3Za0jdk6Mjt8L7g3Dnk+u4qv1Qyi6pT` | Sensitive | `openssl rand -base64 32` — must be same across all envs. Currently **empty** in Vercel (id jDWPTgerzxGcmMW0) — update it. |
| `CRON_SECRET` | `aee296eaabe3e5a35b69d187b6a7f2d0c31d830b29611b7f4f45854d2f408a06` | Sensitive | `openssl rand -hex 32`. Already expected by `vercel.json` cron `0 3 * * * → /api/cron/dispatch`. Do **not** share with cron-job.org (use `/api/cron/tick` for external). |
| `ADMIN_EMERGENCY_KEY` | `/me/PaWvvc/fRK2oVd27GM5KAh9O1WXgyJ0irS5iEwk=` | Sensitive | `openssl rand -base64 32` — 32+ chars. Lets a platform admin use `/emergency` when Google-only login loses password. |

> Your Vercel already has `ADMIN_EMERGENCY_KEY` (id OBqly17lY2cgny1S) but it’s empty — update it with the value above or a freshly generated one.

---

## 2) Site + Firebase — already set, just verify

| Key | Current in Vercel | Action |
|-----|-------------------|--------|
| `NEXT_PUBLIC_SITE_URL` | `https://clyvro.vercel.app` ✅ | Keep. This is what was added to `<meta name="clyvro-verification">` in `src/app/layout.tsx` — leave it so your meta-tag verification works for `*.vercel.app` subdomains. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyA1FVgzimrWl11iQRG0PrPVgHBbhEsdeqY` ✅ | Firebase web keys are **public by design** — keep. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `clyvro001.firebaseapp.com` ✅ | Keep. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `clyvro001` ✅ | Keep. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:544076644923:web:e8e0c37fdf0839f3ea521e` ✅ | Keep. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `544076644923` ✅ | Keep. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `clyvro001.firebasestorage.app` ✅ | Keep (production only). |
| `FIREBASE_PROJECT_ID` | `clyvro001` ✅ | Keep — server anchor for ID-token verification. |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `PGHOST*` / `PGPASSWORD` / `PGUSER` / `PGDATABASE` | Neon integration ✅ | Keep — auto-set by Neon. Preview branch vars are scoped to `arena/f2e4f8b7-clyvro` and show `readable-secret` warning — that’s normal. |

Nothing to do here unless you rotate Firebase or Neon.

---

## 3) Billing (Flutterwave) — honest “not switched on” until these are real

Paste these as TEST so checkout stays honestly disabled (the code checks `FLUTTERWAVE_SECRET_KEY` exists before enabling checkout):

| Key | Test Value | Type | Replace with |
|-----|------------|------|--------------|
| `FLUTTERWAVE_SECRET_KEY` | `FLWSECK_TEST-REPLACE_ME-00000000000000000000000000000000` | Sensitive | Flutterwave Dashboard → Settings → API Keys → Secret Key (starts `FLWSECK-…`). |
| `FLUTTERWAVE_PUBLIC_KEY` | `FLWPUBK_TEST-REPLACE_ME-00000000000000000000000000000000` | Plain | Same page → Public Key (starts `FLWPUBK-…`). |
| `FLUTTERWAVE_WEBHOOK_SECRET` | `34f29b3f7181cef3c26e8861e046cb52` | Sensitive | Dashboard → Webhooks → Secret hash. Generate with `openssl rand -hex 16` and paste same value in both places. |
| `FLUTTERWAVE_API_BASE` | `https://api.flutterwave.com/v3` | Plain | Keep default. |
| `PAYMENT_IP_INTEL_URL` | _(leave unset for now)_ | Plain | Optional: `https://ip-api.com/json/{ip}?fields=status,countryCode,proxy,hosting` |
| `PAYMENT_IP_INTEL_KEY` | _(leave unset)_ | Sensitive | Your IP-intel provider key if you set the URL above. |

---

## 4) Email (SMTP) — password resets, Shield alerts, waitlist

Until `SMTP_HOST` + `EMAIL_FROM` exist, `src/lib/services/notifications.ts` logs `skipped_no_mailer` and still bans — email is best-effort.

| Key | Test Value | Type | Replace with |
|-----|------------|------|--------------|
| `SMTP_HOST` | `smtp.test.example.com` | Plain | Your SMTP host, e.g. `smtp.gmail.com` or `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` | Plain | `587` (STARTTLS) or `465` (SSL) |
| `SMTP_USER` | `test@example.com` | Plain | SMTP username |
| `SMTP_PASS` | `Q7X+PQIRFjJvFdYo3WixOYVbqsLyW4N1` | Sensitive | `openssl rand -base64 24` then replace with real SMTP password/app-password. |
| `SMTP_SECURE` | `0` | Plain | `1` for 465, `0` for 587 |
| `EMAIL_FROM` | `Clyvro <no-reply@your-domain.example>` | Plain | Must be a verified sender, e.g. `Clyvro <no-reply@clyvro.vercel.app>` or your domain. |
| `WAITLIST_NOTIFY_EMAIL` | `admin.founda@gmail.com` | Plain | Where waitlist/Shield incident emails land. You already receive there as fallback — set explicitly to be sure. |
| `SECURITY_CONTACT_EMAIL` | `admin.founda@gmail.com` | Plain | Shown on `/security` + blocked page. |

Alternative single-var form (pick **either** the 5 above **or** this one):
`SMTP_URL=smtp://test%40example.com:TEST_PASS@smtp.test.example.com:587`

---

## 5) Platform owner & admin — who gets /admin + Ultra Agency

| Key | Test Value | Type | Replace with |
|-----|------------|------|--------------|
| `CLYVRO_OWNER_EMAILS` | `legateakanjimusab@gmail.com` | Plain | Comma-separated owner emails — these get Ultra Agency for life. |
| `CLYVRO_ADMIN_EMAILS` | `legateakanjimusab@gmail.com` | Plain | Comma-separated admin emails — these can open `/admin` Control Center (12 sections). Use same as owner while you’re sole admin. |

Already documented in `.env.example` but not yet set in Vercel — add them so `/admin` works after login.

---

## 6) Optional — leave as TEST or unset until you need them

| Key | Test Value | Notes |
|-----|------------|-------|
| `R2_ACCOUNT_ID` / `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | `TEST_REPLACE_ME` | Cloudflare R2 for Admin → Backup & Restore. Until set, the UI honestly says “not configured.” |
| `PLAYWRIGHT_WS_ENDPOINT` | _(unset)_ | Browserless WSS (`wss://production-sfo.browserless.io/?token=…`). When unset, bundled Chromium is used. |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_WEBHOOK_SECRET` | `TEST_REPLACE_ME` | GitHub App for `/app/code-reviewer`. Until all 4 set, page honestly says bot isn’t switched on. |
| `PAGESPEED_API_KEY` | `TEST_REPLACE_ME` | Future perf rules only. |
| `SCAN_MAX_PAGES` etc. | defaults (`10`, `20`, `8000`, `45000`) | Don’t set unless you want to tune. |

---

## Quick copy-paste block (shell)

If you prefer the CLI (`vercel env add`), values below are already escaped for you:

```bash
# Security
vercel env add AUTH_SECRET production preview development  # paste: Tm9/NbQpDKlcqG5Q7ZdKTAWETMtNq30ql3Za0jdk6Mjt8L7g3Dnk+u4qv1Qyi6pT
vercel env add CRON_SECRET production                       # paste: aee296eaabe3e5a35b69d187b6a7f2d0c31d830b29611b7f4f45854d2f408a06
vercel env add ADMIN_EMERGENCY_KEY production              # paste: /me/PaWvvc/fRK2oVd27GM5KAh9O1WXgyJ0irS5iEwk=

# Billing (TEST)
vercel env add FLUTTERWAVE_SECRET_KEY production
# → FLWSECK_TEST-REPLACE_ME-00000000000000000000000000000000
vercel env add FLUTTERWAVE_PUBLIC_KEY production
# → FLWPUBK_TEST-REPLACE_ME-00000000000000000000000000000000
vercel env add FLUTTERWAVE_WEBHOOK_SECRET production
# → 34f29b3f7181cef3c26e8861e046cb52

# Email (TEST)
vercel env add SMTP_HOST production; vercel env add SMTP_PORT production
vercel env add SMTP_USER production; vercel env add SMTP_PASS production
vercel env add EMAIL_FROM production; vercel env add WAITLIST_NOTIFY_EMAIL production

# Owner
vercel env add CLYVRO_OWNER_EMAILS production
vercel env add CLYVRO_ADMIN_EMAILS production
```

---

## After you paste

1. Vercel will show the new vars in **Settings → Environment Variables** with a lock icon for `Sensitive`.
2. Trigger a redeploy — the cron `0 3 * * *` + Shield auto-ban email will only use the new values after a deploy.
3. To verify:
   - `curl https://clyvro.vercel.app/api/cron/health` → should return `{ok:true}` when `CRON_SECRET` is set (or `tick` remains public for cron-job.org).
   - Log in → visit `/admin/security` → toggle Shield mode → check `securityEvents` are no longer all `allow`.
   - Trigger a test incident email via Admin → Security (or wait for a real Shield `confirmed` event) — it should land at `WAITLIST_NOTIFY_EMAIL`.

**Do not commit this file’s real replacements.** Keep real secrets only in Vercel, not in Git.

