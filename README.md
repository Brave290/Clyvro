# Clyvro — Find the friction. Fix the conversion.

Evidence-first website auditing SaaS for freelancers, web design agencies, SEO consultants, and small businesses.

**Current state: Phase 1 (Brand, landing page & product demo) — complete.** The scanner does not exist yet; the example report is clearly-labelled sample data. See `docs/PHASE-STATUS.md`.

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000
```
No environment variables are required for Phase 1 (see `.env.example` for later phases).

## Verify
```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Documentation
- `docs/PRODUCT.md` — vision, customers, positioning rules
- `docs/ARCHITECTURE.md` — stack, module boundaries, security model
- `docs/ROADMAP.md` — the six phases and exit criteria
- `docs/PHASE-STATUS.md` — build tracker (source of truth across sessions)

## Stack
Next.js (App Router) · TypeScript (strict) · Tailwind CSS 4 · Lucide icons. Neon Postgres + Drizzle, background jobs, and the isolated scanner worker arrive in Phases 2–3 per the roadmap.
