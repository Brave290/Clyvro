import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Site API — Full Scan and Site Guard",
  description: "How Pro and Agency workspaces scan their own sites and put Clyvro’s request inspector in front of them. Unlimited. Not a pentest tool.",
  alternates: { canonical: "/docs/api" },
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app";

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Pro &amp; Agency</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Site API</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">
        Two things, one key. Start a Full Scan of a site you own, or ask Site Guard whether a request should be allowed — the same inspector Clyvro uses on itself.
        Unlimited on Pro and Ultra Agency. Other plans have no API. This is a strict scanner and a site guard, not a pentest product.
      </p>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">1. Create a key</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Sign in as an owner or admin on a Pro or Agency workspace.</li>
          <li>Open <Link href="/app/settings" className="font-semibold text-accent hover:underline">Settings</Link> → Site API keys.</li>
          <li>Name the key (for example “Production”) and create it. Copy the secret once — it starts with <code className="rounded bg-canvas px-1 font-mono text-ink">cly_</code> and we only store a hash.</li>
          <li>Send it as <code className="rounded bg-canvas px-1 font-mono text-ink">Authorization: Bearer cly_…</code>. Up to 5 active keys per workspace. Revoke from the same page.</li>
        </ol>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">2. Site Guard — put the inspector in front of your site</h2>
        <p>
          Call this from your own server (or edge) on every request you want scored. You send the method, path, query string and User-Agent.
          We return <strong className="text-ink">allow</strong> or <strong className="text-ink">block</strong> using the same honeypot paths, tool fingerprints and signatures Clyvro uses.
          We never send attacks at your visitors. You decide what “block” means on your side (403, drop, challenge).
        </p>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-canvas p-4 text-xs leading-relaxed text-ink">{`curl -sS -X POST ${SITE}/api/v1/guard \\
  -H "Authorization: Bearer cly_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "GET",
    "path": "/.env",
    "search": "",
    "userAgent": "sqlmap/1.7"
  }'`}</pre>
        <p>Typical reply:</p>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-canvas p-4 text-xs leading-relaxed text-ink">{`{
  "action": "block",
  "verdict": "block",
  "reason": "honeypot",
  "score": 3,
  "alwaysEnforced": true
}`}</pre>
        <p className="font-semibold text-ink">Fields you can send</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><code className="font-mono text-ink">method</code> — HTTP method (default GET).</li>
          <li><code className="font-mono text-ink">path</code> — URL path starting with <code className="font-mono">/</code>. Required for a useful verdict.</li>
          <li><code className="font-mono text-ink">search</code> — raw query string, including the leading <code className="font-mono">?</code>, or empty.</li>
          <li><code className="font-mono text-ink">userAgent</code> — the visitor’s User-Agent, or null.</li>
        </ul>
        <p className="font-semibold text-ink">How to customize</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-ink">Monitor first:</strong> log <code className="font-mono">action</code> and <code className="font-mono">reason</code> without blocking, then switch your middleware to enforce.</li>
          <li><strong className="text-ink">Always-enforced hits</strong> (<code className="font-mono">alwaysEnforced: true</code>) are honeypots, offensive-tool User-Agents, and null bytes. Treat those as block even while you are still watching.</li>
          <li><strong className="text-ink">Suspicious</strong> (<code className="font-mono">verdict: "suspicious"</code>) is a weak signal — log it; do not lock out real customers.</li>
          <li>Skip your own health checks and static assets. Only send paths that look like a page or an API.</li>
        </ul>
        <p>
          Node-shaped sketch (you own the 403):
        </p>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-canvas p-4 text-xs leading-relaxed text-ink">{`export async function guard(req) {
  const res = await fetch("${SITE}/api/v1/guard", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.CLYVRO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      method: req.method,
      path: new URL(req.url).pathname,
      search: new URL(req.url).search,
      userAgent: req.headers.get("user-agent"),
    }),
  });
  const json = await res.json();
  if (json.action === "block") return new Response("Not found", { status: 404 });
  return null; // continue to your app
}`}</pre>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">3. Full Scan via API</h2>
        <p>
          Starts the same Full Scan as the app: rules audit, strict security (hidden paths and detection probes on a <em>verified</em> domain), Flow Scan, AI-Pattern, Readiness.
          You must own the site or have the owner’s permission — send <code className="font-mono text-ink">consent: true</code>.
          Verify the domain in the app first if you want hidden/admin paths included.
        </p>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-canvas p-4 text-xs leading-relaxed text-ink">{`# Queue a run, then poll
curl -sS -X POST ${SITE}/api/v1/scans \\
  -H "Authorization: Bearer cly_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://your-site.com","consent":true}'

# → { "id": "…", "status": "queued" }

curl -sS ${SITE}/api/v1/scans/SCAN_ID \\
  -H "Authorization: Bearer cly_YOUR_KEY"

# Wait in this request (can take several minutes)
curl -sS -X POST ${SITE}/api/v1/scans \\
  -H "Authorization: Bearer cly_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://your-site.com","consent":true,"wait":true}'

# Recent runs
curl -sS ${SITE}/api/v1/scans \\
  -H "Authorization: Bearer cly_YOUR_KEY"`}</pre>
        <p>
          Poll until <code className="font-mono">status</code> is <code className="font-mono">completed</code> or <code className="font-mono">failed</code>.
          <code className="font-mono">stages</code> holds the scoreboard (audit, security, flow, ai, readiness). Any gap on a verified site deducts from the strict security score.
        </p>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">4. Errors</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><code className="font-mono text-ink">401 UNAUTHORIZED</code> — missing or revoked key.</li>
          <li><code className="font-mono text-ink">403 PLAN_LIMIT</code> — workspace is not on Pro or Agency.</li>
          <li><code className="font-mono text-ink">403 CONSENT_REQUIRED</code> — scans need <code className="font-mono">consent: true</code>.</li>
          <li><code className="font-mono text-ink">422 VALIDATION</code> — bad path or body.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">What this is not</h2>
        <p>
          We do not sell a pentest, we do not exploit your site, and we do not submit forms or log in.
          Detection probes on a verified domain only look for reflections and reachable files the owner asked us to check.
          Use Full Scan on sites you own.
        </p>
        <p>
          Questions: <a className="font-semibold text-accent hover:underline" href="mailto:admin.founda@gmail.com">admin.founda@gmail.com</a>
        </p>
      </section>
    </div>
  );
}
