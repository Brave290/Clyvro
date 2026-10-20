# Clyvro — Roadmap (one phase at a time; never auto-advance)

| Phase | Goal | "If you stop here" | Exit criteria |
|---|---|---|---|
| ✅ 1 Brand & demo (2026-10-19) | Marketing site + labelled sample report | Polished concept to show prospects | Site runs, mobile OK, credible sample report, no fake scanner claims |
| ✅ 2 Real scanner (2026-10-20) | URL validation, bounded HTTP crawl, small deterministic ruleset, status, graceful failures | Functional technical prototype | Safe public URL → real findings; invalid/blocked sites handled. Isolated worker introduced here if host limits require (not required yet — synchronous bounded scan; moves in P3) |
| ✅ 3 Persistent audit SaaS foundation (2026-10-20) | Auth, Postgres (Neon-ready) + Drizzle, orgs/projects, durable background audits, history, comparisons, share links, USD plan quotas (no billing) | Real product foundation | ✅ Sign in → project → audit → revisit → inspect evidence → compare → share securely. PDF export deferred (print-friendly report first, Phase 4+); payments Phase 6 |
| ✅ 4 Agency workflows (2026-10-20) | Client workspaces, team roles + invitations, branded shared reports, portfolio overview, onboarding | Credible product for a specific buyer | ✅ Several clients without data mixing (org-scoped, tested); branded report delivered on white-label plans; roles enforced server-side |
| 5 Verification & monitoring | Rescans, issue lifecycle, change history, schedules | Ongoing value, not one-time scans | "What changed / is it fixed?" answerable from history |
| 6 Commercial launch | Payments, entitlements, email, monitoring, backups, onboarding | Launch-ready foundation | Production-readiness checklist incl. tested SSRF controls |
| 7 Deep private UI and route scan | With explicit user authorization, inspect every selected private/authenticated route and page for visual defects, UI bugs, broken interactions and accessibility issues | Evidence-backed private-site quality report | Respect authentication and scope; use bounded browser visits; preserve evidence and route coverage; report uncertainty and do not change the scanned site |

The GitHub MCP security assistant is current implementation work, not a roadmap-only promise. It is separate from the future deep private UI/route scanner.

Rules: commit + tag each phase (`phase-1-demo`, …); keep sample data separate from real data; no AI before accurate rules; validate with users in P2, seek a paid pilot in P3.
