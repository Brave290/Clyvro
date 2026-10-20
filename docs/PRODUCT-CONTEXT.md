# Clyvro — Product Context (Canonical)

This is the condensed, canonical version of the founder's official Product
Context Pack. It is the source of truth for positioning, scope, and product
rules. If code, copy, or older docs disagree with this file, fix them to match.

## 1. What Clyvro is

An evidence-first **website Revenue Leak Hunter**: it finds the places a
website quietly loses enquiries, calls, bookings, or sales — shows the
evidence, prioritises the fixes, helps verify them, and proves the work to
clients.

- Tagline: **"Find the friction. Fix the conversion."**
- Long-term promise: **Find the friction. Fix the conversion. Verify the
  result. Prove the work.**
- Primary customer: freelancers, consultants, and small agencies who look
  after other people's websites.
- Wedge: a scanner whose findings are backed by recorded evidence and a
  stated confidence basis — not generic scores or AI guesses.

The loop: **find issues → evidence → prioritise → fix → verify → prove to
clients → monitor.**

## 2. Honesty rules (non-negotiable)

1. Never claim exact lost revenue, never claim to prove why visitors left.
2. Never fabricate customers, testimonials, results, statistics, uptime,
   monitoring, or trends.
3. Distinguish **confirmed / measured / heuristic / not checked** everywhere.
4. Every finding carries a rule ID + ruleset version, the evidence observed,
   and its confidence basis.
5. The score is deterministic, documented, and internal — a to-do ranking,
   never a sales/traffic prediction. (Formula: `100 − (12×critical + 7×high
   + 4×medium + 1.5×low)`, floor 0.)
6. Never silently substitute fake or sample data; only real check results
   are shown. There is no demo data on the website.
7. Never present unbuilt features (monitoring, PDF export, billing) as
   available. Roadmap items are labelled as such.
8. Public copy is plain language ordinary people understand; technical
   detail lives inside the app and reports.

## 3. Brand

- Premium B2B SaaS look. Accent **blue `#2563EB`** (dark-mode `#3B82F6`) —
  founder decision; the pack's earlier "restrained violet" line is superseded.
- The audit report is the most important screen in the product.
- No dead buttons, no fake data, no unexplained scores.

## 4. Stack (mandatory unless a documented constraint says otherwise)

Next.js App Router + React + TypeScript (strict) + Tailwind, shadcn-style
components, Lucide icons; Neon Postgres + Drizzle ORM; Auth.js for auth
(never hand-roll password/session security); durable DB-backed scan jobs;
Vitest. Stay affordable: no Redis/Kafka/vector DB/microservices/Kubernetes
without justification. Scanner safety: full SSRF protection, bounded
crawling, forms never submitted, safe observations only (not a penetration
tool), deterministic rules before any AI, AI never invents observations.

## 5. Plans (proposed USD — not purchasable until Phase 6)

| Plan | Price | Checks/mo | Pages/check | Websites | Seats | White-label |
|---|---|---|---|---|---|---|
| Freemium | $0 | 3 | 10 | 1 | 1 | — |
| Basic | $19 | 25 | 100 | 3 | 1 | — |
| Pro | $49 | 100 | 500 | 10 | 3 | — |
| Ultra Agency | $129 | 500 | 1000 | 100 | 10 | ✓ |

Quotas and seats are enforced server-side from day one. No "unlimited"
promises. Failed checks never count against quota.

## 6. Phase plan (one approved phase at a time)

- **Phase 1 — Marketing site & demo.** ✅ Done (`phase-1-demo`).
- **Phase 2 — Real SSRF-safe scanner + evidence rules.** ✅ Done
  (`phase-2-scanner`).
- **Phase 3 — SaaS core:** accounts, organisations, projects, saved audits,
  background jobs, quotas, comparisons, finding lifecycle, revocable share
  links. ✅ Done (`phase-3-saas`).
- **Phase 4 — Agency workflows:** client workspaces, team roles +
  invitations, branded client-ready reports, portfolio overview, onboarding. ✅
  Built (`phase-4-agency`, pending merge approval).
- **Phase 5 — Monitoring & proof:** scheduled checks, Fix Ledger, Revenue
  Path Monitor, Change Impact Radar, Control Center/cron. 🔒 Locked until
  founder approval.
- **Phase 6 — Commercial:** payments, live subscriptions, checkout, webhooks.
  🔒 Locked. No payment code before this phase.

A phase ships only when it is functional, tested, documented, and presentable.
Pull requests to the default branch are opened, never self-merged.

## 7. Release blockers (security)

Cross-organisation data leakage · IDOR · unauthorised role/membership
changes · public reports leaking private data · guessable or reusable
tokens · missing server-side plan enforcement · SSRF regressions · secrets
in logs · unprotected admin actions.

## 8. Explicitly out of scope unless a phase says otherwise

Scheduled monitoring/cron · PDF pipeline · white-label designer ·
AI revenue claims · payments (Phase 6) · sending email (invitations are
copy-links; nothing pretends to send mail).
