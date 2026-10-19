# Clyvro build tracker

- [x] **Phase 1 — Brand and demo** (2026-10-19)
- [ ] Phase 2 — Real scanner
- [ ] Phase 3 — Audit MVP (Neon)
- [ ] Phase 4 — Agency workflows
- [ ] Phase 5 — Verification and monitoring
- [ ] Phase 6 — Commercial launch

## Phase 1 completion notes
- Built: homepage, how-it-works, example report (8 fictional findings, filterable, expandable evidence), pricing (honest "at launch"), privacy, terms; design system tokens (Ink #111827, violet #6D5EF7, canvas #F8FAFC); reusable ScoreRing / SeverityBadge / ConfidenceBadge / FindingCard; deterministic scoring formula + Vitest contract tests.
- Honesty controls: sample report banner + "SAMPLE DATA" labels; waitlist stores locally only and says so; no testimonials/logos/statistics anywhere.
- Not built (by design): scanner, auth, database, billing, background jobs.
- Known limitations: waitlist has no backend; pricing figures unpublished by design; privacy/terms are prototype drafts.
- Next: Phase 2 — await explicit approval.
