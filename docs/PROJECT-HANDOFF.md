# Clyvro — Project handoff

**Default branch:** `all`  
**Live site:** https://clyvro.vercel.app  
**Repo:** https://github.com/Brave290/Clyvro  
**This file + `docs/FOUNDER-NEXT.md` are the only project docs.** Everything else (phase trackers, architecture notes, TODO, plan.md, old pentest write-ups) was folded in here on 2026-10-22.

Clyvro is in **Beta**. All numbers and findings on the site are from real checks. There is no sample/demo data in product UI (the public Flow Scan marketing page is labelled a sample replay).

---

## 1. What Clyvro is

Evidence-first **website Revenue Leak Hunter** for freelancers, consultants, and small agencies who look after other people’s sites.

- Tagline: **Find the friction. Fix the conversion.**
- Loop: find issues → evidence → prioritise → fix → verify → prove to clients → monitor.
- Wedge: every finding has a rule ID, a ruleset version (**6.5.0**), observed evidence, and a confidence basis (confirmed / measured / heuristic). Not generic scores. Not AI guesses.

### Honesty rules (non-negotiable)

1. Never claim exact lost revenue. Never claim to prove why visitors left.
2. Never fabricate customers, testimonials, results, statistics, uptime, or trends.
3. Distinguish confirmed / measured / heuristic / not checked.
4. The audit score is `100 − (12×critical + 7×high + 4×medium + 1.5×low)`, floor 0. Internal ranking only.
5. Full Scan uses a **stricter** score (`strictSecurityScore`: crit 20 / high 12 / med 6 / low 3, plus extra lock fails). Still not a pentest score.
6. Never present unbuilt features as live.
7. Public copy is plain language. Technical detail stays in the app and reports.
8. Full Scan / Site API / Site Guard are a **strict scanner and site guard**. Do **not** call them a pentest product. Detection probes on a verified domain are owner-consented, non-destructive, and never submit forms.

### Brand

Premium B2B SaaS. Accent blue `#2563EB` (dark `#3B82F6`). Founder rejected violet. Report is the most important screen.

---

## 2. Stack

- **App:** Next.js App Router, React 19, TypeScript strict, Tailwind 4, Lucide.
- **DB:** Neon Postgres in production (`DATABASE_URL` pooled). Local/tests: embedded PGlite. Drizzle ORM. Migrations in `drizzle/` (applied on boot).
- **Auth:** Auth.js (credentials + optional Firebase Google). Org switch via httpOnly `clyvro-org` cookie. Roles: owner / admin / member / viewer — enforced server-side. Public chrome (`Nav`, homepage, pricing) reads the session so signed-in visitors see **Open dashboard**, not Sign in. `/sign-in` and `/sign-up` redirect to `/app/scan` when already signed in.
- **Scanner:** `src/lib/scanner/` — SSRF boundary, pinned-IP undici fetch, bounded crawl, parse, **ruleset 6.5.0**.
- **Browser:** Playwright (`playwright-core` + `@sparticuz/chromium`, or `PLAYWRIGHT_WS_ENDPOINT`). Flow Scan only. Forms never submitted.
- **Payments:** Flutterwave Inline (`FlutterwaveCheckout`) + HTML POST fallback. **Do not** mint Standard `flwlnk` session links (HTTP 500). Charge currency follows region (IP → IP tz → device tz → locale). No VPN/proxy block.
- **Tests:** Vitest (`npm test`). Live HTTP smoke: `node scripts/e2e.mjs <origin>`.
- Stay cheap: no Redis, Kafka, vector DB, microservices, Kubernetes unless a documented constraint forces it.

---

## 3. Phases (historical — all 1–5 code is in `all`)

| Phase | Status | What shipped |
|---|---|---|
| 1 Brand & demo | Done 2026-10-19 | Marketing site. Sample report later retired. |
| 2 Real scanner | Done 2026-10-20 | SSRF-safe crawl + deterministic rules. |
| 3 SaaS foundation | Done 2026-10-20 | Auth, orgs, projects, saved audits, jobs, share links, quotas. |
| 4 Agency | Done 2026-10-20 | Clients, roles, invitations, branded reports, portfolio. |
| 5 Verification & monitoring | Built | Schedules, resumable scans, cron, deep mode, Readiness. |
| 6 Commercial launch | In progress | Flutterwave checkout exists; auto-renew and live merchant proof are **not** signed off. See Founder Next. |
| 7 Deep private UI/route scan | Roadmap only | Authenticated/private pages. Not built. |

---

## 4. Product surface (what exists)

### Public

`/` `/scan` `/how-it-works` `/pricing` `/privacy` `/terms` `/refund-policy` `/security` `/changelog` `/feature-requests` `/sign-in` `/sign-up` `/forgot-password` `/flow-scan` (marketing) `/docs/api`

Anonymous visitors get **one** free public check (`/api/scan`). Further checks ask them to sign up.

### App (signed-in)

Scan · Overview · Clients · Projects · Readiness · AI-Pattern · Flow Scan · Full Scan · **API & keys** (Pro/Agency, dedicated) · Hack Protection · SEO Visibility · **Code Reviewer (Coming soon)** · Developer Tools · Schedules & cron · Team · Billing · Feature requests · Settings

### Admin

Overview, Users, Workspaces, Jobs, Legal, Changelog, Cron, Email (SMTP test + log of sent/failed/pending since day one), Billing catalog, Security (Shield mode), Backups, Maintenance, Audit log, Feature-request triage. Emergency door: `/emergency` + `ADMIN_EMERGENCY_KEY`.

---

## 5. Engines (all ruleset 6.5 — there is no v5 product)

`RULESET_VERSION = "6.5.0"` in `src/lib/scanner/config.ts`. UI, exports, Flow Scan rendered-DOM pass, and crawl comments all say 6.5.

| Engine | Where | What it actually does |
|---|---|---|
| **HTTP crawl + rules 6.5** | `/scan`, `/app/scan`, audits Normal/Strict/Deep | Public pages only. Deep (verified owner): sitemap, hidden/admin path seeds, robots-disallowed URLs, injection-**detection** probes. Forms never submitted. |
| **Flow Scan** | `/app/flow-scan` | Real Chromium. Up to 5 pages, 75s. Live JPEG of the viewport is written onto the latest step (`steps[].preview`) and shown in the browser chrome. Page thumbs in the report. If Chromium cannot start, the run **fails honestly** — nothing is simulated. |
| **Full Scan** | `/app/full-scan` Pro/Agency unlimited | 5 isolated stages: rules audit (owned full-site when verified) → strict security (locks + probes) → Flow Scan (live browser pane) → AI-Pattern → Readiness. |
| **Hack Protection** | `/app/hack-protection` | Read-only headers, cookies, sensitive-file HEAD probes. |
| **Site Guard** | `POST /api/v1/guard` | Same Shield inspector Clyvro uses on itself. Returns allow/block. Pro/Agency API key. |
| **Site API Full Scan** | `POST /api/v1/scans` | Same Full Scan. `consent: true` required. |
| **AI-Pattern / Readiness / Dev tools / SEO** | their `/app/...` pages | Separate engines; Full Scan calls the first two. |

### Why Playwright “wasn’t showing live stuff”

1. **Screenshots were dropped.** Captures above **45 KB** were discarded, so most real pages produced **no picture**. Quality now steps down until the JPEG fits (~90 KB thumbs, ~160 KB live).
2. **The browser chrome only showed a text log.** The viewport now shows the **actual JPEG** Chromium just captured (`steps[].preview`), polled every 1.5s.
3. **Full Scan hid the browser.** Stage 3 now saves `stages.flow.scanId` **before** Playwright runs, and the Full Scan page embeds the same live `FlowBrowser`.
4. **Deep Scan is not Playwright.** It is the HTTP crawler. The audit page now shows a live crawl chrome (current URL, title, pages/links actually fetched). The rendered picture lives on Flow Scan / Full Scan.
5. **Chromium on Vercel** needs `@sparticuz/chromium` (bundled) or `PLAYWRIGHT_WS_ENDPOINT`. Launch now falls back to a local Playwright install. If none of those work, the run is marked failed and the allowance is refunded.

Safety: public URLs only, navigation re-checked, checkout/delete/sign-out never clicked, forms never submitted.

---

## 6. Plans (live catalogue — `src/lib/plans.ts`)

Server-enforced. Failed checks never count.

| Plan | Site checks / mo | Pages / check | Deep | Full Scan + Site API | Flow Scan | Notes |
|---|---|---|---|---|---|---|
| Freemium | 10 | 10 | 1 lifetime | none | 1 / month | |
| Basic | 60 | 250 | 3 / month | none | 5 / month | |
| Pro | 300 | 1000 | 25 / month | **unlimited** | 25 / month | API keys, Site Guard |
| Ultra Agency | 1500 | 2000 | unlimited | **unlimited** | unlimited | White-label, 10 seats |

Site API: hashed keys `cly_` + 24 bytes, SHA-256 stored, max 5 active / org, Pro+. Table `org_api_keys` (migration `0028`).

---

## 7. Scanner security model

Implemented in `src/lib/scanner/ssrf.ts` + `fetcher.ts` + `crawl.ts`:

- http/https only, no credentials, default ports.
- localhost / `*.local` / `*.internal` rejected.
- Private, loopback, link-local, metadata (`169.254.169.254`), CGNAT, multicast, documentation ranges blocked (IPv4 + IPv6 + embeddings).
- DNS resolved once; **any** non-public address rejects the host.
- Connection pinned to the validated IP (TLS SNI keeps the hostname) — anti-rebinding.
- Redirects followed manually; every hop re-validated (max 5).
- Body cap 1.5 MB, per-request timeout, crawl deadline, slice budget.
- Deep + owner-verified: robots.txt is recorded but **not** used to skip URLs; hidden paths are seeded.
- Only scan sites the user owns or is authorized to assess.

Clyvro Shield (`src/lib/shield/`) inspects every request (honeypots, tool UAs, signatures). Default mode **Monitor**. `/api/v1/` is CSRF- and Shield-exempt so customers can call Site Guard without banning their own server.

---

## 8. Billing (Flutterwave)

- **Inline only** (`FlutterwaveCheckout` + HTML POST to `/v3/hosted/pay`).
- **Do not** mint Standard `flwlnk` links — they 500.
- **Do not** retry USD on an NG merchant — *Invalid charge request* (historical). Charge currency follows the resolved region: NG NGN, GB GBP, GH GHS, eurozone EUR, else USD. Country selector stays gone. IP country wins over a spoofed timezone. No VPN/proxy block. American/other cards still work on Flutterwave.
- Merchant is still paid in Flutterwave; only charge currency changes (NG NGN, GB GBP, GH GHS, eurozone EUR, else USD).
- Checksum: if enabled on the dashboard, send `payload_hash`.
- Auto-renew: Payment Plans in code; **not production-verified**. Toggle-on happens at checkout (need a card). Do not ship a standalone customer toggle before recurring webhooks are proven.
- Webhook: `https://clyvro.vercel.app/api/billing/webhook`.

---

## 9. Key code map

| Path | Role |
|---|---|
| `src/lib/scanner/` | Crawl, parse, rules 6.5, SSRF, fetcher, vuln probes |
| `src/lib/services/flow-scan.ts` | Playwright walker + live JPEG |
| `src/lib/browser-preview.ts` | Chromium launch + JPEG capture |
| `src/components/FlowBrowser.tsx` | Live browser chrome (image + steps) |
| `src/lib/services/full-scan.ts` | Five-stage bundle |
| `src/lib/jobs.ts` | Resumable audit slices + live crawl progress |
| `src/lib/shield/` | Request inspector (also Site Guard) |
| `src/lib/services/org-api.ts` | API keys |
| `src/app/api/v1/` | `guard`, `scans` |
| `src/app/docs/api/page.tsx` | Customer API docs (Copy all + per-snippet copy) |
| `src/app/app/api-keys/page.tsx` | Workspace API & keys |
| `drizzle/0028_org_api_keys.sql` | API key table |
| `scripts/e2e.mjs` | Live HTTP e2e (section 8 covers deep/full/flow without waiting 75s for Chromium) |
| `scripts/pentest-live.mjs` | Non-destructive probe of **our** deployment only |

---

## 10. Environment (production)

See `.env.example`. Must-haves for a real launch:

`DATABASE_URL` (Neon pooled) · `AUTH_SECRET` · `NEXT_PUBLIC_SITE_URL` · Flutterwave public/secret + webhook secret · `CRON_SECRET` · SMTP if you want mail · Firebase `NEXT_PUBLIC_FIREBASE_*` for Google · `ADMIN_EMERGENCY_KEY` · optional `PLAYWRIGHT_WS_ENDPOINT` · optional R2 for backups · optional `FLUTTERWAVE_SUBACCOUNT_ID`.

Local: no env required. PGlite under `.data/`.

---

## 11. Tests you can run now

```bash
npm install
npx tsc --noEmit
npx vitest run          # unit + integration (PGlite)
# Live instance (local next start or production):
node scripts/e2e.mjs http://localhost:3000
# Optional, only against a site you own:
npm run pentest -- https://clyvro.vercel.app probe
```

This sandbox cannot reach `clyvro.vercel.app`. GitHub.com is allowed; scanner pinned-IP fetch may still fail here even when `curl` works.

---

## 12. What is not finished

Copied from the live founder list (keep `FOUNDER-NEXT.md` in sync):

- Flutterwave auto-renew / recurring webhook never seen on the live merchant.
- Shield stays Monitor until the founder switches Enforce. No proof-of-work for Under-attack.
- SMTP, Google sign-in, R2 backups, cron-job.org — founder dashboards.
- Code Reviewer Coming soon. GitHub App credentials not live.
- Phase 7 authenticated crawl — not built.
- TOTP 2FA, session list, new-device email — not built.
- No PDF invoices. Print/save PDF on reports is the browser print dialog (`ReportExportBar` / `ExportBar`) — **do not change that**.
- Beta badge still on public nav.

---

## 13. Next agent — reverify everything (start → end)

Do this in order. Record pass/fail with evidence (command + first line of output, or a screenshot description). Produce a short **Reverification report** at the end for the founder. Do not invent numbers. Do not call Full Scan a pentest.

### A. Repo & docs

1. Confirm only `docs/FOUNDER-NEXT.md` and `docs/PROJECT-HANDOFF.md` exist under `docs/` (plus this file’s references). No leftover PHASE-STATUS / TODO / plan.md.
2. `rg -n "Rules v5|ruleset 5\\.0" src` — should be empty in UI copy. Engines say 6.5.
3. `git log -5 --oneline` on `all` and the working branch.

### B. Typecheck, unit tests, lint

```bash
npx tsc --noEmit
npx vitest run
npx next lint
```

Must include: `flow-scan.test.ts` live preview, `crawl.test.ts` ownerDeep hidden paths, `org-api.test.ts`, `full-scan.test.ts` (Pro unlimited), `rules-v65.test.ts`, Shield, hack-protection.

### C. Local app boot

```bash
npm run dev
```

Bind `0.0.0.0`. Open `/`, `/scan`, `/docs/api`, `/sign-up`. No console errors. Public Flow Scan sample is labelled sample.

### D. Auth & workspace

1. Register a fresh account. Sign out / sign in.
2. Freemium: Full Scan locked. Flow Scan remaining = 1. Deep scan: 1 lifetime, verification required.
3. (If you can) set `organizations.plan_id = 'pro'` in DB and confirm **API & keys** in the sidebar, Full Scan unlocked, create `cly_` key, copy once. Docs at `/docs/api` have Copy all.

### E. HTTP crawl (Normal / Strict / Deep)

1. Normal scan of a public site you own (or github.com if egress allows). Confirm rulesetVersion `6.5.0` on the report.
2. Deep scan without verification → refused (`DOMAIN_NOT_VERIFIED` or consent).
3. Verify a domain (DNS TXT or homepage meta `clyvro-verification`). Deep scan: live crawl chrome shows **changing** current URL and page counts. Hidden paths (`/admin`, `/login`, robots-disallowed) appear in fetches when they exist.
4. Confirm robots.txt is **not** skipping those URLs when `ownerDeep` is on.

### F. Flow Scan (the live picture)

1. Start Flow Scan on a real site. Keep the tab open.
2. Within ~15s the black viewport must show a **JPEG of the real page**, with a Live badge, not a spinner forever.
3. Address bar updates as pages change. Step log matches.
4. If Chromium cannot start: status `failed`, message says the browser couldn’t start, **no fake screenshot**, allowance refunded.
5. After completion: desktop + mobile thumbs in the report (when under the byte cap).

### G. Full Scan

1. Pro/Agency only. Verify domain first.
2. Five stages tick. When Flow starts, the **same live browser** appears on the Full Scan page (`stages.flow.scanId` set while status is `running`).
3. Strict security score is present. Unverified domain: hidden-path note, locks still ran.
4. Export bar (markdown / JSON / agent brief / print) still works — do not rewrite it.

### H. Site API

```bash
curl -sS -X POST "$ORIGIN/api/v1/guard" \
  -H "Authorization: Bearer cly_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method":"GET","path":"/.env","search":"","userAgent":"sqlmap/1.7"}'
# expect action=block

curl -sS -X POST "$ORIGIN/api/v1/scans" \
  -H "Authorization: Bearer cly_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-site.com","consent":true}'
```

No key → 401. Free plan key create → 403 PLAN_LIMIT.

### I. Shield & abuse

Honeypot `/.env` and `sqlmap` UA → 403. `/emergency` still opens. CSRF: browser cross-site POST to `/api/*` blocked; `/api/v1/` allowed.

### J. Billing (founder or staging merchant only)

Do **not** mint `flwlnk`. From Lagos, NGN. Visa/Verve. If *Invalid charge request*, check NGN-if-NG and checksum — do not retry USD. Auto-renew only after webhook is confirmed.

### K. Live e2e against a running instance

```bash
node scripts/e2e.mjs https://clyvro.vercel.app
```

Section 8 asserts docs, Guard 401, Full Scan plan gate, Flow Scan queue, Deep Scan engine call **without** waiting for Playwright.

### L. Production egress caveat

Pinned-IP fetch can fail in locked-down sandboxes even when `curl https://github.com` works. If so, say so. Do not mark the scanner broken on that evidence alone — rerun on Vercel or a machine with normal DNS+TCP.

### M. Report format (give this to the founder)

```
Reverification report — YYYY-MM-DD
Branch / commit:
tsc: pass/fail
vitest: N passed / N failed (names of failures)
lint:
Local boot:
Normal scan: site, score, rulesetVersion, pages
Deep scan: verified? hidden paths seen? live URL chrome?
Flow Scan: live JPEG yes/no; if no, exact error
Full Scan: five stages; live browser embedded?
Site API: guard block on /.env? scans 202/201?
Shield honeypot:
E2E script: passed/failed counts
Billing: not run / result
Blockers:
Leftover from FOUNDER-NEXT still true:
```

If anything fails, fix it on this branch, add a regression test, and do not claim it ships until the report says so.
