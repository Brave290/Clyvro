# Clyvro — Find the friction. Fix the conversion.

Evidence-first website auditing SaaS for freelancers, web design agencies, SEO consultants, and small businesses.

**Current state: Phase 4 (agency workflows) — built, pending merge.** Visitors get one free anonymous check at `/scan`. Signed-in users organise websites under clients, run saved checks, compare runs, share branded reports, and invite teammates with owner/admin/member/viewer roles — all with server-enforced plan limits. All data shown is real; there is no sample/demo data anywhere on the site. Payments (Phase 6) and scheduled monitoring (Phase 5) do not exist yet and are never presented as available. See `docs/PHASE-STATUS.md`.

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000  → open /scan
```
No environment variables are required locally (an embedded database is used; data lives in `.data/`). For production set `DATABASE_URL` (Neon Postgres) and `AUTH_SECRET`. Optional tuning is documented in `.env.example`.

## Scanner safety model (summary)
Every submitted/redirected/discovered URL is validated before any connection: http/https only, no credentials, default ports, public-IP range checks over DNS results (private/loopback/link-local/metadata addresses blocked for IPv4+IPv6 and transition embeddings), connections pinned to the validated IP to defeat DNS rebinding, manual redirect handling with re-validation, strict page/depth/size/time budgets, robots.txt respected, forms never submitted. Details: `docs/ARCHITECTURE.md`, implementation: `src/lib/scanner/`. Only scan sites you own or are authorized to assess.

## Verify
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
114 tests cover SSRF attacks (obfuscated IPs, DNS rebinding/mixed records, redirect-to-private), fetcher limits, the ruleset against HTML fixtures, crawl bounds/coverage, and Phase 3–4 integration: accounts, org isolation, quotas, jobs, clients, roles/invitations, branding gating, and anti-abuse claims.

## Documentation
- `docs/PRODUCT-CONTEXT.md` — canonical product context (positioning, honesty rules, phase plan)
- `docs/PRODUCT.md` — vision, customers, positioning rules
- `docs/ARCHITECTURE.md` — stack, scanner pipeline, security model
- `docs/ROADMAP.md` — the six phases and exit criteria
- `docs/PHASE-STATUS.md` — build tracker (source of truth across sessions)

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind CSS 4 · Lucide icons · undici (pinned-IP fetching) · node-html-parser · Neon Postgres + Drizzle ORM (embedded PGlite fallback with identical migrations for zero-config local runs) · Auth.js credentials auth with scrypt password hashing · DB-backed background scan jobs (durable queue, bounded retries, idempotent results/usage).
