# Clyvro — Roadmap (one phase at a time; never auto-advance)

| Phase | Goal | "If you stop here" | Exit criteria |
|---|---|---|---|
| ✅ 1 Brand & demo (2026-10-19) | Marketing site + labelled sample report | Polished concept to show prospects | Site runs, mobile OK, credible sample report, no fake scanner claims |
| ✅ 2 Real scanner (2026-10-20) | URL validation, bounded HTTP crawl, small deterministic ruleset, status, graceful failures | Functional technical prototype | Safe public URL → real findings; invalid/blocked sites handled. Isolated worker introduced here if host limits require (not required yet — synchronous bounded scan; moves in P3) |
| 3 Audit MVP | Auth, Neon + Drizzle, projects, durable audits, history, sharing, PDF export | Real product; first milestone to monetize | Sign in → project → audit → revisit → inspect evidence → share securely |
| 4 Agency workflows | Multi-client, org members, branded reports, quotas | Credible product for a specific buyer | Several clients without data mixing; branded report delivered |
| 5 Verification & monitoring | Rescans, issue lifecycle, change history, schedules | Ongoing value, not one-time scans | "What changed / is it fixed?" answerable from history |
| 6 Commercial launch | Payments, entitlements, email, monitoring, backups, onboarding | Launch-ready foundation | Production-readiness checklist incl. tested SSRF controls |

Rules: commit + tag each phase (`phase-1-demo`, …); keep sample data separate from real data; no AI before accurate rules; validate with users in P2, seek a paid pilot in P3.
