/** Shared Site API examples — public docs, in-app quick start, and Copy all. */

export const SITE_API_BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "");

export const SITE_API_SNIPPETS = {
  guardCurl: `curl -sS -X POST ${SITE_API_BASE}/api/v1/guard \\
  -H "Authorization: Bearer cly_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "GET",
    "path": "/.env",
    "search": "",
    "userAgent": "sqlmap/1.7"
  }'`,

  guardOk: `{
  "action": "block",
  "verdict": "block",
  "reason": "honeypot",
  "score": 3,
  "alwaysEnforced": true
}`,

  guardChallenge: `{
  "action": "challenge",
  "verdict": "suspicious",
  "reason": "probe",
  "score": 1,
  "alwaysEnforced": false,
  "challengeToken": "…"
}`,

  widget: `<script src="${SITE_API_BASE}/shield.js" data-sitekey="clys_YOUR_SITE_KEY"></script>`,

  cliInstall: `curl -fsSL ${SITE_API_BASE}/install.sh | sh
clyvro login`,

  mcpConfig: `{
  "mcpServers": {
    "clyvro": {
      "command": "clyvro",
      "args": ["mcp"],
      "env": { "CLYVRO_API_KEY": "cly_YOUR_KEY" }
    }
  }
}`,

  guardNode: `export async function guard(req) {
  const url = new URL(req.url);
  const res = await fetch("${SITE_API_BASE}/api/v1/guard", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.CLYVRO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      method: req.method,
      path: url.pathname,
      search: url.search,
      userAgent: req.headers.get("user-agent"),
    }),
  });
  const json = await res.json();
  if (json.action === "block") {
    return new Response("Not found", { status: 404 });
  }
  return null; // continue to your app
}`,

  guardPython: `import os, requests

def guard(method, path, search="", user_agent=None):
    r = requests.post(
        "${SITE_API_BASE}/api/v1/guard",
        headers={"Authorization": "Bearer " + os.environ["CLYVRO_API_KEY"]},
        json={"method": method, "path": path, "search": search, "userAgent": user_agent},
        timeout=8,
    )
    r.raise_for_status()
    return r.json()

# if guard("GET", "/.env")["action"] == "block": return 404`,

  scanCreate: `curl -sS -X POST ${SITE_API_BASE}/api/v1/scans \\
  -H "Authorization: Bearer cly_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://your-site.com","consent":true}'

# → HTTP 202  { "id": "…", "status": "queued" }`,

  scanPoll: `curl -sS ${SITE_API_BASE}/api/v1/scans/SCAN_ID \\
  -H "Authorization: Bearer cly_YOUR_KEY"

# Poll until status is "completed" or "failed".
# stages holds the scoreboard: audit, security, flow, ai, readiness.`,

  scanWait: `curl -sS -X POST ${SITE_API_BASE}/api/v1/scans \\
  -H "Authorization: Bearer cly_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://your-site.com","consent":true,"wait":true}'

# → HTTP 201  { "id": "…", "status": "completed", "stages": { … } }
# Can take several minutes. Prefer queue + poll in CI.`,

  scanList: `curl -sS ${SITE_API_BASE}/api/v1/scans \\
  -H "Authorization: Bearer cly_YOUR_KEY"

# → { "history": [ { "id", "targetUrl", "status", "createdAt", "finishedAt" } ],
#     "pagination": { "page": 1, "pageSize": 20, "total": 3, "pageCount": 1 } }`,

  scanNode: `const key = process.env.CLYVRO_API_KEY;
const base = "${SITE_API_BASE}";

const created = await fetch(base + "/api/v1/scans", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + key,
    "content-type": "application/json",
  },
  body: JSON.stringify({ url: "https://your-site.com", consent: true }),
}).then((r) => r.json());

let row;
for (let i = 0; i < 40; i++) {
  await new Promise((ok) => setTimeout(ok, 8000));
  row = await fetch(base + "/api/v1/scans/" + created.id, {
    headers: { Authorization: "Bearer " + key },
  }).then((r) => r.json());
  if (row.status === "completed" || row.status === "failed") break;
}
console.log(row.status, row.stages);`,
} as const;

export function siteApiQuickStart(base = SITE_API_BASE): string {
  return [
    SITE_API_SNIPPETS.guardCurl,
    "",
    SITE_API_SNIPPETS.scanCreate,
    "",
    SITE_API_SNIPPETS.scanPoll,
    "",
    SITE_API_SNIPPETS.scanList,
  ].join("\n").replaceAll(SITE_API_BASE, base);
}

export function siteApiDocsMarkdown(base = SITE_API_BASE): string {
  const s = SITE_API_SNIPPETS;
  return `# Clyvro Site API

Base URL: ${base}
Auth: Authorization: Bearer cly_…
Plans: Pro and Agency only. Unlimited Full Scan + Site Guard.
Keys: create under /app/api-keys (owners and admins). Up to 5 active keys. Secret shown once.

This is a strict scanner and a site guard. It is not a pentest product. We do not exploit sites, submit forms, or log in.

## 1. Create a key

1. Sign in as an owner or admin on a Pro or Agency workspace.
2. Open /app/api-keys.
3. Name the key (for example "CI pipeline") and create it.
4. Copy the secret once. It starts with cly_. We only store a hash.
5. Send it as: Authorization: Bearer cly_…

Revoke unused keys from the same page.

## 2. Site Guard  POST /api/v1/guard

Put the same inspector Clyvro uses on itself in front of your site.
You send method, path, query string and User-Agent.
We return allow, challenge, or block. Challenge is a branded Clyvro check — not a puzzle captcha.

${s.guardCurl}

Typical block reply:

${s.guardOk}

Fields you can send:
- method — HTTP method (default GET)
- path — URL path starting with / (required for a useful verdict, max 2048 chars)
- search — raw query string including the leading ?, or empty
- userAgent — the visitor's User-Agent, or omit

Reply:
- action — allow | challenge | block
- verdict — allow | suspicious | block
- reason — honeypot | scanner-ua | null-byte | family of the top signature, or null
- score — signature weight
- alwaysEnforced — true for honeypots, offensive-tool User-Agents, and null bytes

How to customize:
- Monitor first: log action and reason without blocking, then enforce.
- Always-enforced hits: treat as block even while you are still watching.
- suspicious is a weak signal — log it; do not lock out real customers.
- Skip health checks and static assets. Only send paths that look like a page or an API.

Node:

${s.guardNode}

Python:

${s.guardPython}

Widget (site key, public script):

${s.widget}

POST /api/v1/guard/verify with the secret key + token after the visitor continues.

## 3. Full Scan  POST /api/v1/scans

Starts the same Full Scan as the app: rules audit, strict security (hidden paths and detection probes on a verified domain), Flow Scan, AI-Pattern, Readiness.
You must own the site or have the owner's permission — send consent: true.
Verify the domain in the app first if you want hidden/admin paths included.

Queue a run:

${s.scanCreate}

Poll:

${s.scanPoll}

Wait in this request (can take several minutes):

${s.scanWait}

Recent runs:

${s.scanList}

Node poll loop:

${s.scanNode}

GET /api/v1/scans/:id fields:
- id, targetUrl, status (queued | running | completed | failed)
- steps — live log while it runs
- stages — scoreboard once finished (audit, security, flow, ai, readiness)
- errorMessage, createdAt, finishedAt

Kick a queued run (the CLI does this so the scan actually starts):

POST /api/v1/scans/:id/run

Any gap on a verified site deducts from the strict security score.

## 4. Other tools

All need Authorization: Bearer cly_… (or a CLI login token) and consent: true on sites you own.

- POST /api/v1/lab — one GET/HEAD/OPTIONS on a verified path
- POST /api/v1/lab/scan — discover real pages (sitemap, robots, links) plus the sensitive-file list
- POST /api/v1/pentests — authorized pentest (verified domain)
- GET /api/v1/pentests/:id
- POST /api/v1/pentests/:id/run
- POST /api/v1/flow-scans — live walk-through
- GET /api/v1/flow-scans/:id
- POST /api/v1/flow-scans/:id/run
- POST /api/v1/hack-protection
- POST /api/v1/seo
- POST /api/v1/reviews — save a CLI Code Reviewer report (findings only, never source)
- GET /api/v1/me

## 5. CLI and MCP

${s.cliInstall}

Then: clyvro scan https://your-site.com --consent

Thorough Code Reviewer (writes REVIEW.md in the folder):

clyvro review .

MCP:

${s.mcpConfig}

Device login: POST /api/v1/cli/device → open /cli/device → POST /api/v1/cli/device/token

Developers chooser (phone): /developers

## 6. Errors

All errors look like { "error": { "code": "…", "message": "…" } }

- 401 UNAUTHORIZED — missing, malformed, or revoked key
- 403 PLAN_LIMIT — workspace is not on Pro or Agency
- 403 CONSENT_REQUIRED — scans need consent: true
- 404 NOT_FOUND — scan id does not belong to this workspace
- 422 VALIDATION — bad path, body, or more than 5 active keys

## What this is not

We do not sell a pentest, we do not exploit your site, and we do not submit forms or log in.
Detection probes on a verified domain only look for reflections and reachable files the owner asked us to check.
Use Full Scan on sites you own.

Questions: admin.founda@gmail.com
`.replaceAll(SITE_API_BASE, base);
}
