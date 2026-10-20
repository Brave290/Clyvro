# Clyvro build tracker

- [x] **Phase 1 — Brand and demo** (2026-10-19)
- [ ] Phase 2 — Real scanner
- [ ] Phase 3 — Audit MVP (Neon)
- [ ] Phase 4 — Agency workflows
- [ ] Phase 5 — Verification and monitoring
- [ ] Phase 6 — Commercial launch

## Phase 1 completion notes
- Built: homepage, how-it-works, example report (8 fictional findings, filterable, expandable evidence), pricing (honest "at launch"), privacy, terms; design system tokens (Ink #111827, accent blue #2563EB, canvas #F8FAFC); reusable ScoreRing / SeverityBadge / ConfidenceBadge / FindingCard; deterministic scoring formula + Vitest contract tests.
- Honesty controls: sample report banner + "SAMPLE DATA" labels; waitlist stores locally only and says so; no testimonials/logos/statistics anywhere.
- Not built (by design): scanner, auth, database, billing, background jobs.
- Known limitations: waitlist has no backend; pricing figures unpublished by design; privacy/terms are prototype drafts.
- Next: Phase 2 — await explicit approval.

## Post-Phase-1 updates
- Rebrand (2026-10-20): accent changed from violet to blue (#2563EB / deep #1D4ED8 / soft #EFF6FF); branded dropdown pickers (`BrandSelect`) + `::selection`; waitlist role "Other" → "Developer"; founder email confirmation added to the waitlist; tasteful animations added (hero stagger, scroll reveals via `Reveal`, animated score ring count-up, card hovers, smooth finding expand) — all respecting `prefers-reduced-motion`. Site merged to the default branch so files are visible at repo root.
