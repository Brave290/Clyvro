# Clyvro — Product

**Tagline:** Find the friction. Fix the conversion.

Clyvro analyzes public websites to identify verifiable technical, usability, performance, and conversion-related issues. It explains the evidence behind each finding, recommends fixes, and helps prioritize improvements.

## Initial customer
Small web design agencies, freelance developers, and SEO consultants auditing B2B SaaS / service-business sites, landing pages, pricing pages, and contact/signup pages.

## Positioning rules (binding)
- Never claim a public scan computes exact lost revenue or proves visitors abandon a site.
- Distinguish observed evidence / inferred issues / estimated impact.
- Every finding: rule ID + version, evidence, confidence basis, explanation.
- AI (later) may only explain verified evidence — never invent observations.
- Never fabricate logos, testimonials, results, or statistics.

## Finding data contract
Each finding carries: stable ID, audit/page, rule ID + version, category, severity, confidence basis (confirmed / measured / heuristic), title, explanation, structured evidence, recommended action, effort estimate, impact rationale, timestamp, verification status. Severity, confidence, and business impact stay separate.

## Audit score
Deterministic: 100 − (12×critical + 7×high + 4×medium + 1.5×low), floored at 0. An internal prioritization score — not a conversion rate or revenue prediction. Implemented and unit-tested in `src/lib/types.ts`.
