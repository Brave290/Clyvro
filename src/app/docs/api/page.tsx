import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, CopyButton } from "@/components/CopyCode";
import { SITE_API_BASE, SITE_API_SNIPPETS, siteApiDocsMarkdown } from "@/lib/site-api-docs";

export const metadata: Metadata = {
  title: "Site API — Full Scan and Site Guard",
  description: "How Pro and Agency workspaces scan their own sites and put Clyvro’s request inspector in front of them. Unlimited. Not a pentest tool.",
  alternates: { canonical: "/docs/api" },
};

export default function ApiDocsPage() {
  const s = SITE_API_SNIPPETS;
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Pro &amp; Agency</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-4xl font-bold tracking-tight">Site API</h1>
        <CopyButton text={siteApiDocsMarkdown()} label="Copy all" copiedLabel="Copied all" />
      </div>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">
        Start a Full Scan of a site you own, or ask Site Guard whether a request should be allowed.
      </p>
      <p className="mt-3 text-sm text-ink-mute">
        Base URL <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-ink">{SITE_API_BASE}</code>
        {" · "}Auth <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-ink">Authorization: Bearer cly_…</code>
      </p>

      <nav aria-label="On this page" className="mt-8 rounded-2xl border border-line bg-canvas px-5 py-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">On this page</p>
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <li><a href="#create-a-key" className="font-semibold text-accent hover:underline">1. Create a key</a></li>
          <li><a href="#site-guard" className="font-semibold text-accent hover:underline">2. Site Guard</a></li>
          <li><a href="#full-scan" className="font-semibold text-accent hover:underline">3. Full Scan</a></li>
          <li><a href="#errors" className="font-semibold text-accent hover:underline">4. Errors</a></li>
        </ol>
      </nav>

      <section id="create-a-key" className="mt-12 scroll-mt-24 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">1. Create a key</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Sign in as an owner or admin on a Pro or Agency workspace.</li>
          <li>Open <Link href="/app/api-keys" className="font-semibold text-accent hover:underline">API &amp; keys</Link> in the sidebar.</li>
          <li>Name the key (for example “CI pipeline”) and create it. Copy the secret once — it starts with <code className="rounded bg-canvas px-1 font-mono text-ink">cly_</code> and we only store a hash.</li>
          <li>Send it as <code className="rounded bg-canvas px-1 font-mono text-ink">Authorization: Bearer cly_…</code>. Up to 5 active keys per workspace. Revoke from the same page.</li>
        </ol>
        <p>The label field does not autofill. The secret is shown once; if you lose it, revoke and create another.</p>
      </section>

      <section id="site-guard" className="mt-12 scroll-mt-24 space-y-4 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">2. Site Guard — put the inspector in front of your site</h2>
        <p>
          <code className="rounded bg-canvas px-1 font-mono text-ink">POST {SITE_API_BASE}/api/v1/guard</code>
        </p>
        <p>
          Call this from your own server (or edge) on every request you want scored. You send the method, path, query string and User-Agent.
          We return <strong className="text-ink">allow</strong> or <strong className="text-ink">block</strong> using the same honeypot paths, tool fingerprints and signatures Clyvro uses.
          We never send attacks at your visitors. You decide what “block” means on your side (403, drop, challenge).
        </p>
        <CodeBlock caption="curl — Site Guard" code={s.guardCurl} />
        <p className="font-semibold text-ink">Typical block reply</p>
        <CodeBlock caption="JSON" code={s.guardOk} />

        <p className="font-semibold text-ink">Request body</p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-mute">
              <tr><th className="px-4 py-2 font-semibold">Field</th><th className="px-4 py-2 font-semibold">Required</th><th className="px-4 py-2 font-semibold">What to send</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="px-4 py-2 font-mono text-ink">method</td><td className="px-4 py-2">No</td><td className="px-4 py-2">HTTP method. Default GET.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">path</td><td className="px-4 py-2">Yes</td><td className="px-4 py-2">URL path starting with <code className="font-mono">/</code>, max 2048 characters.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">search</td><td className="px-4 py-2">No</td><td className="px-4 py-2">Raw query string including the leading <code className="font-mono">?</code>, or empty.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">userAgent</td><td className="px-4 py-2">No</td><td className="px-4 py-2">The visitor’s User-Agent, or omit.</td></tr>
            </tbody>
          </table>
        </div>

        <p className="font-semibold text-ink">Reply</p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-mute">
              <tr><th className="px-4 py-2 font-semibold">Field</th><th className="px-4 py-2 font-semibold">Meaning</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="px-4 py-2 font-mono text-ink">action</td><td className="px-4 py-2"><code className="font-mono">allow</code> or <code className="font-mono">block</code> — enforce-mode decision.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">verdict</td><td className="px-4 py-2"><code className="font-mono">allow</code>, <code className="font-mono">suspicious</code>, or <code className="font-mono">block</code>.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">reason</td><td className="px-4 py-2">Headline family: honeypot, scanner-ua, null-byte, or a signature family.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">score</td><td className="px-4 py-2">Signature weight. 3 or more is enough to block in enforce.</td></tr>
              <tr><td className="px-4 py-2 font-mono text-ink">alwaysEnforced</td><td className="px-4 py-2">True for honeypots, offensive-tool User-Agents, and null bytes.</td></tr>
            </tbody>
          </table>
        </div>

        <p className="font-semibold text-ink">How to customize</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-ink">Monitor first:</strong> log <code className="font-mono">action</code> and <code className="font-mono">reason</code> without blocking, then switch your middleware to enforce.</li>
          <li><strong className="text-ink">Always-enforced hits</strong> (<code className="font-mono">alwaysEnforced: true</code>) are honeypots, offensive-tool User-Agents, and null bytes. Treat those as block even while you are still watching.</li>
          <li><strong className="text-ink">Suspicious</strong> (<code className="font-mono">verdict: &quot;suspicious&quot;</code>) is a weak signal — log it; do not lock out real customers.</li>
          <li>Skip your own health checks and static assets. Only send paths that look like a page or an API.</li>
        </ul>

        <CodeBlock caption="Node — you own the 403" code={s.guardNode} />
        <CodeBlock caption="Python" code={s.guardPython} />
      </section>

      <section id="full-scan" className="mt-12 scroll-mt-24 space-y-4 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">3. Full Scan via API</h2>
        <p>
          <code className="rounded bg-canvas px-1 font-mono text-ink">POST {SITE_API_BASE}/api/v1/scans</code>
          {" · "}
          <code className="rounded bg-canvas px-1 font-mono text-ink">GET {SITE_API_BASE}/api/v1/scans</code>
          {" · "}
          <code className="rounded bg-canvas px-1 font-mono text-ink">GET {SITE_API_BASE}/api/v1/scans/:id</code>
        </p>
        <p>
          Starts the same Full Scan as the app: rules audit, strict security (hidden paths and detection probes on a <em>verified</em> domain), Flow Scan, AI-Pattern, Readiness.
          You must own the site or have the owner’s permission — send <code className="font-mono text-ink">consent: true</code>.
          Verify the domain in the app first if you want hidden/admin paths included.
        </p>
        <CodeBlock caption="Queue a run (HTTP 202)" code={s.scanCreate} />
        <CodeBlock caption="Poll one run" code={s.scanPoll} />
        <CodeBlock caption="Wait in this request (HTTP 201)" code={s.scanWait} />
        <CodeBlock caption="List recent runs" code={s.scanList} />
        <CodeBlock caption="Node — queue then poll" code={s.scanNode} />
        <p>
          Poll until <code className="font-mono">status</code> is <code className="font-mono">completed</code> or <code className="font-mono">failed</code>.
          <code className="font-mono">stages</code> holds the scoreboard (audit, security, flow, ai, readiness). Any gap on a verified site deducts from the strict security score.
        </p>
        <p className="font-semibold text-ink">GET /api/v1/scans/:id</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><code className="font-mono text-ink">id</code>, <code className="font-mono text-ink">targetUrl</code></li>
          <li><code className="font-mono text-ink">status</code> — queued, running, completed, failed</li>
          <li><code className="font-mono text-ink">stages</code> — scoreboard once finished</li>
          <li><code className="font-mono text-ink">errorMessage</code>, <code className="font-mono text-ink">createdAt</code>, <code className="font-mono text-ink">finishedAt</code></li>
        </ul>
      </section>

      <section id="errors" className="mt-12 scroll-mt-24 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">4. Errors</h2>
        <p>Every error looks like <code className="font-mono text-ink">{`{ "error": { "code": "…", "message": "…" } }`}</code></p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-mute">
              <tr><th className="px-4 py-2 font-semibold">HTTP</th><th className="px-4 py-2 font-semibold">Code</th><th className="px-4 py-2 font-semibold">When</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="px-4 py-2 font-mono">401</td><td className="px-4 py-2 font-mono text-ink">UNAUTHORIZED</td><td className="px-4 py-2">Missing, malformed, or revoked key.</td></tr>
              <tr><td className="px-4 py-2 font-mono">403</td><td className="px-4 py-2 font-mono text-ink">PLAN_LIMIT</td><td className="px-4 py-2">Workspace is not on Pro or Agency.</td></tr>
              <tr><td className="px-4 py-2 font-mono">403</td><td className="px-4 py-2 font-mono text-ink">CONSENT_REQUIRED</td><td className="px-4 py-2">Scans need <code className="font-mono">consent: true</code>.</td></tr>
              <tr><td className="px-4 py-2 font-mono">404</td><td className="px-4 py-2 font-mono text-ink">NOT_FOUND</td><td className="px-4 py-2">That scan id is not in this workspace.</td></tr>
              <tr><td className="px-4 py-2 font-mono">422</td><td className="px-4 py-2 font-mono text-ink">VALIDATION</td><td className="px-4 py-2">Bad path or body, or already 5 active keys.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 space-y-3 text-sm leading-relaxed text-ink-soft">
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
