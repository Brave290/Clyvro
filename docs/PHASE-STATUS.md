# Clyvro build tracker

- [x] **Phase 1 — Brand and demo** (2026-10-19) — tag `phase-1-demo`
- [x] **Phase 2 — Real scanner** (2026-10-20) — tag `phase-2-scanner`
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

## Phase 2 completion notes
- Built a real, bounded website scanner at `/scan` + `POST /api/scan` (see `src/lib/scanner/`):
  - **SSRF boundary first** (`ssrf.ts`): http/https only, no credentials, default ports only; localhost/`*.local`/`*.internal`/single-label hosts rejected; IPv4+IPv6 private/loopback/link-local (incl. cloud metadata 169.254.169.254)/CGNAT/multicast/reserved/documentation ranges blocked, incl. IPv4-mapped, NAT64/Teredo/6to4 embeddings; numeric-IP obfuscations caught via URL normalization; DNS resolved once, *any* non-public address rejects the host.
  - **Pinned-IP fetcher** (`fetcher.ts`): undici connects to the validated IP (TLS SNI keeps the hostname) to defeat DNS rebinding; redirects followed manually with full re-validation per hop (max 5); per-request timeout (8s); decoded body cap 1.5 MB (truncate + flag); non-HTML bodies not downloaded except robots.txt.
  - **Bounded crawler** (`crawl.ts`): same-origin BFS, max 10 pages / depth 2, robots.txt respected for discovered URLs, up to 20 extra headers-only link verifications + all same-origin form destinations (safe GET, forms never submitted), 45s hard deadline → partial report. Coverage (incl. what was *not* checked) is counted and shown.
  - **Deterministic ruleset v1.0.0** (`rules.ts`, 12 rules): missing/duplicate titles, missing meta description, broken internal links, broken form destinations (with no-submit caveat), missing img alt, unlabelled form fields, missing viewport/lang/H1, sensitive forms over HTTP, plus one clearly-labelled heuristic (no detectable primary call-to-action on the landing page). Every finding carries rule ID + version, severity, confidence basis, evidence, fix, effort, and impact rationale; report separates confirmed/measured/heuristic counts.
  - **API**: synchronous bounded scan (fits one request), structured errors, per-IP rate limit (5 scans/10 min; validation rejections are quota-free). The `ScanReport` JSON is the contract Phase 3 moves to a background worker unchanged.
  - **UI**: `/scan` with live elapsed timer, score ring, filters (category/severity/confidence), pages table, coverage & limitations panel; Phase 1 site/sample report preserved and cross-linked.
- Verified: typecheck + lint clean; **93 Vitest tests** (SSRF incl. obfuscated IPs/IPv6 transitions/mixed DNS, redirect-to-private attacks, caps/timeouts, rule fixtures incl. negative cases, crawl bounds/robots/deadline); production build passes; live end-to-end scan of github.com (10 pages, 177 links discovered, deterministic repeat result), plus blocked-IP/404/non-HTML/DNS failure paths exercised over HTTP. Note: this dev sandbox's egress only permits a few hosts (github/npm/pypi) — arbitrary sites can't be smoke-tested from here, but the same code path is exercised by tests with injected transports.
- Known limitations (stated in-product too): raw-HTML view only (JS-rendered content can be missed — Playwright arrives when a check needs it); no performance/Core Web Vitals yet (PageSpeed later); scans are synchronous and capped (45s) and results are **not saved**; rate limiting is in-memory (resets on restart, doesn't span instances); scanner runs in the web app's process for the prototype — Phase 3 isolates it in a worker without secrets before any public launch; scan only sites you're authorized to assess.
- Not built (by design): Neon/persistence, auth, accounts/projects, billing, agency features, scheduled scans.
- Next: Phase 3 (Neon + auth + saved audits) — await explicit approval.
