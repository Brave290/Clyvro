# Clyvro — Architecture

## Phase 1 (now)
Single Next.js app (App Router, TypeScript strict, Tailwind 4). Static marketing pages + a sample-data report (`src/lib/sample-report.ts`) rendered by the same Finding components the real product will use. No DB, no auth, no scanner.

## Target architecture (Phases 2–3)
Modular monolith + separately deployed, isolated scanning worker:

```
apps/web (Next.js) ──► Neon Postgres (Drizzle, pooled; direct for migrations)
        │ enqueue (durable job service, behind a small internal abstraction)
        ▼
apps/scanner-worker (Node/TS; HTTP crawl first, Playwright selectively)
packages: database · audit-engine (versioned ruleset) · shared (Zod schemas) · ui
```
Deliberately avoided until justified: Redis, Kafka, vector DB, microservices, Kubernetes.

## Modules
Auth & organizations · Projects · Audit orchestration · Crawling · Rule evaluation · Prioritization · Results/history · Reports/exports · Billing/usage · Notifications · Admin/ops.

## Security model (scanner)
URLs are untrusted: HTTP(S) only; reject loopback/private/link-local/reserved/metadata IPs after DNS resolution; re-validate every redirect; port/size/time/concurrency limits; no credential forwarding. Worker isolated with no app secrets, restricted network, per-job cleanup. Server-side authorization on every org-owned operation; public reports use high-entropy revocable tokens.

## Data growth by phase
P1 none · P2 optional prototype persistence · P3 Neon: organizations/members/projects/audits/pages/findings · P4 report settings/usage/sharing tokens · P5 schedules/lifecycle/comparisons · P6 subscriptions/webhook events/entitlements.
