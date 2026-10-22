# Clyvro

Evidence-first website checks. **Beta** — https://clyvro.vercel.app

```bash
npm install
npm run dev      # local, PGlite, no env required
npm test
npx tsc --noEmit
```

Production needs `DATABASE_URL` (Neon) and `AUTH_SECRET`. Copy `.env.example`.

**Docs (only these two):**

- [`docs/FOUNDER-NEXT.md`](docs/FOUNDER-NEXT.md) — founder checklist (keys, Flutterwave, what is not live)
- [`docs/PROJECT-HANDOFF.md`](docs/PROJECT-HANDOFF.md) — product, engines (ruleset 6.5), live browser, tests, next-agent reverify
