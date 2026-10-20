# Clyvro — Find the friction. Fix the conversion.

Evidence-first website auditing SaaS for freelancers, web design agencies, SEO consultants, and small businesses.

**Current state: Phase 2 (real, bounded website scanner) — complete.** Submit a public URL at `/scan` and get deterministic, evidence-backed findings from an SSRF-protected crawler. Results are **not saved yet** — accounts, projects, and persistence (Neon) arrive in Phase 3. All data shown is real: the Phase 1 sample report was retired once the live scanner landed (it remains in git history under the `phase-1-demo` tag; `/example-report` redirects to `/scan`). See `docs/PHASE-STATUS.md`.

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000  → open /scan
```
No environment variables are required. Optional scanner tuning (page/link budgets, timeouts) is documented in `.env.example`.

## Scanner safety model (summary)
Every submitted/redirected/discovered URL is validated before any connection: http/https only, no credentials, default ports, public-IP range checks over DNS results (private/loopback/link-local/metadata addresses blocked for IPv4+IPv6 and transition embeddings), connections pinned to the validated IP to defeat DNS rebinding, manual redirect handling with re-validation, strict page/depth/size/time budgets, robots.txt respected, forms never submitted. Details: `docs/ARCHITECTURE.md`, implementation: `src/lib/scanner/`. Only scan sites you own or are authorized to assess.

## Verify
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
93 tests cover SSRF attacks (obfuscated IPs, DNS rebinding/mixed records, redirect-to-private), fetcher limits, the ruleset against HTML fixtures, and crawl bounds/coverage.

## Documentation
- `docs/PRODUCT.md` — vision, customers, positioning rules
- `docs/ARCHITECTURE.md` — stack, scanner pipeline, security model
- `docs/ROADMAP.md` — the six phases and exit criteria
- `docs/PHASE-STATUS.md` — build tracker (source of truth across sessions)

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind CSS 4 · Lucide icons · undici (pinned-IP fetching) · node-html-parser · Neon Postgres + Drizzle ORM (embedded PGlite fallback with identical migrations for zero-config local runs) · Auth.js credentials auth with scrypt password hashing · DB-backed background scan jobs (durable queue, bounded retries, idempotent results/usage).
