# Clyvro — Architecture

## Now (Phases 1–2)
Single Next.js app (App Router, TypeScript strict, Tailwind 4):
- Marketing pages (the Phase 1 sample report was retired when real scans shipped; preserved under the `phase-1-demo` tag).
- Theming: CSS-variable design tokens consumed by Tailwind 4 (`@theme inline`); System/Light/Dark via a pre-paint script + `localStorage` (`src/lib/theme.ts`), class strategy on `<html>`. Branded primitives: custom listbox picker, dialog, toasts (`src/components/`).
- Real scanner under `src/lib/scanner/`, invoked synchronously by `POST /api/scan`
  under strict bounds (≤45 s). No DB, no auth, results are not persisted.

Scanner pipeline (each stage independently testable, transport/DNS injectable):
```
POST /api/scan
  → ssrf.assertPublicUrl    protocol/credentials/port checks, host rules,
                            DNS resolution + public-IP range validation
  → fetcher.fetchPublic     undici with pinned-IP lookup (anti-rebinding),
                            manual redirects (re-validated per hop),
                            timeout + decoded-body byte cap
  → crawl.crawlSite         same-origin BFS (≤10 pages, depth ≤2),
                            robots.txt, link + form-destination verification,
                            coverage accounting, hard deadline
  → parse.parsePage         node-html-parser fact extraction (no JS execution)
  → rules.runRules          deterministic ruleset v1.0.0 → Finding[]
  → scan.runScan            ScanReport JSON (status, score, findings, pages,
                            coverage, limitations) — the Phase 3 worker contract
```

## Target architecture (Phase 3+)
Modular monolith + separately deployed, isolated scanning worker:

```
apps/web (Next.js) ──► Neon Postgres (Drizzle, pooled; direct for migrations)
        │ enqueue (durable job service, behind a small internal abstraction)
        ▼
apps/scanner-worker (Node/TS; HTTP crawl first, Playwright selectively)
packages: database · audit-engine (versioned ruleset) · shared (Zod schemas) · ui
```
The Phase 2 scanner modules move into the worker/audit-engine unchanged —
only the caller changes (job handler instead of the API route).
Deliberately avoided until justified: Redis, Kafka, vector DB, microservices, Kubernetes.

## Modules
Auth & organizations · Projects · Audit orchestration · Crawling · Rule evaluation · Prioritization · Results/history · Reports/exports · Billing/usage · Notifications · Admin/ops.

## Security model (scanner) — implemented in Phase 2
URLs are untrusted: HTTP(S) only, no embedded credentials, default ports only;
localhost/internal-style hostnames rejected; loopback/private/link-local/reserved/
documentation/CGNAT/multicast IP ranges blocked for IPv4 and IPv6, including
IPv4-mapped and NAT64/Teredo/6to4 embeddings; DNS resolved once and every
address checked (fail closed on mixed records); connections are pinned to a
validated IP so DNS rebinding can't retarget the socket; every redirect hop is
fully re-validated; per-request timeout, response-size cap, page/depth/link
budgets and a global deadline; forms are never submitted; no cookies or
app credentials are ever sent to scanned sites; per-IP scan rate limit at the API.
Still to come before public launch: worker isolation (no app secrets, restricted
network egress, per-job cleanup), distributed rate limiting/quotas, and authz on
saved data (Phase 3+). Server-side authorization on every org-owned operation;
public reports will use high-entropy revocable tokens.

## Data growth by phase
P1 none · P2 none (ephemeral scan results only) · P3 Neon: organizations/members/projects/audits/pages/findings · P4 report settings/usage/sharing tokens · P5 schedules/lifecycle/comparisons · P6 subscriptions/webhook events/entitlements.
