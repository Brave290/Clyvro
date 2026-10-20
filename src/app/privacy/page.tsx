import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy policy" };
export default function Privacy() { return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="animate-fade-up text-4xl font-bold tracking-tight">Privacy policy</h1>
  <p className="mt-2 text-sm text-ink-mute">Last updated October 2026. This page will be replaced with a reviewed policy before any commercial launch.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">Scanning a website</h2>
      <p className="mt-2">When you submit a URL, our server fetches that public website (and a bounded set of its same-site pages and links) to produce your report. Scan results are generated for your request and are <strong className="text-ink">not stored</strong> — there are no accounts yet. Standard server logs (including IP addresses, used for rate limiting) may be retained briefly by our hosting provider. Scanned websites receive ordinary HTTP requests identifying as <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">ClyvroBot</code>; we never send them your cookies or credentials, and we never submit forms.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Stored in your browser</h2>
      <p className="mt-2">Two things use local storage, only on your device: your color-theme preference, and — if you register interest in Clyvro Dev — the email/role you entered. The Clyvro Dev form has no mailing backend yet; nothing is transmitted unless you choose the “confirm by email” step, which opens your own mail app addressed to the founder. There are no analytics trackers or advertising cookies on this site.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">When accounts launch</h2>
      <p className="mt-2">The Phase 3 product will store submitted URLs and findings so you can revisit them. It will not sell personal data. A full policy covering processors, retention, and your rights will be published before that launch.</p></section>
  </div></div>); }
