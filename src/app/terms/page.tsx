import type { Metadata } from "next";
import { getPublishedLegal } from "@/lib/services/legal";
import LegalPageView from "@/components/LegalPageView";
export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using Clyvro's website scanner and workspace: fair use, scanning permissions and account rules.",
  alternates: { canonical: "/terms" },
};
export const dynamic = "force-dynamic";
export default async function Terms() {
  const published = await getPublishedLegal("terms");
  if (published.body) return <LegalPageView title={published.title} body={published.body} publishedAt={published.publishedAt} />;
  return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="animate-fade-up text-4xl font-bold tracking-tight">Terms of service</h1>
  <p className="mt-2 text-sm text-ink-mute">Last updated 22 October 2026. Effective 22 October 2026.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">1. Acceptance &amp; eligibility</h2>
      <p className="mt-2 text-sm">By creating an account or using any part of the Clyvro website, scanner, cron scheduler, or associated tools, you agree to these Terms. You must be at least 16, capable of entering a binding contract, and using the service for a purpose you are authorised to pursue. If you act on behalf of a company or client, you warrant you have authority to bind them to these Terms.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">2. Account responsibilities</h2>
      <p className="mt-2 text-sm">You are responsible for activity under your account — keep your password and session private. Notify us if you suspect compromise. Google sign-in is provided via Firebase; revoking at myaccount.google.com also signs you out here. We may suspend accounts that enable abuse or violate acceptable-use rules, with the action recorded in the admin audit log.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">3. Acceptable use</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Only scan websites you own or are expressly authorised to assess. Scanning third-party sites without permission may be unlawful in your jurisdiction.</li>
        <li>Do not circumvent rate limits, SSRF protections, authentication, or plan quotas.</li>
        <li>Do not use Clyvro to probe, overload, or interfere with other systems, nor to distribute spam or malware.</li>
        <li>Do not share scan results that identify third-party vulnerabilities without responsible disclosure to the affected site owner.</li>
      </ul></section>
    <section><h2 className="text-lg font-semibold text-ink">4. Scanning authorization &amp; scope</h2>
      <p className="mt-2 text-sm">The scanner follows only http/https public URLs, refuses private/internal targets by design, validates every DNS result and redirect hop, pins the connection IP, and respects robots.txt. Page/depth/size/time budgets are enforced. Findings are observations, not guarantees — heuristics are always labelled as such. Deep scans require DNS-proven ownership and explicit consent; they crawl a capped set of same-origin pages and link checks.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">5. Cron jobs &amp; resource usage</h2>
      <p className="mt-2 text-sm">You may schedule HTTP cron jobs under your plan&apos;s cron limit; each run is SSRF-validated and recorded. Excessive concurrency, SSRF bypass attempts, internal network access, or denial-of-service abuse may be blocked. Timing is best-effort (opportunistic inside Clyvro activity plus at least daily dispatcher); short intervals are approximate. You are responsible for ensuring your cron targets can be called safely and legally. POST is GET + body; redirects are not followed for POST.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">6. Plans, billing &amp; cancellation</h2>
      <p className="mt-2 text-sm">Four plans: Freemium, Basic ($19/mo), Pro ($49/mo), Ultra Agency. Prices are fixed per currency and shown in your detected region; checkout is via Flutterwave and the billed amount is computed and verified server-side (transaction re-verified against the Flutterwave API). Billing grants are 30 days and handled idempotently. You may cancel before renewal; access continues until the current period ends. Failed scans are never charged. Refund details: see /refund-policy and any admin-published pricing addenda.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">7. Beta limitations</h2>
      <p className="mt-2 text-sm">Clyvro is currently in <strong className="text-ink">Beta</strong>. Features, limits, rulesets, and pricing may change as the product matures. Features marked Beta (Flow Scan, Hack Protection, SEO Visibility, Schedules) are functional but may still evolve; we disclose limitations honestly in the product and changelog ( /changelog ). Beta does not imply that data loss is expected, but you should keep your own backups of critical client reports until the product exits Beta.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">8. Intellectual property &amp; content</h2>
      <p className="mt-2 text-sm">Your submitted URLs, custom project data, scan schedules, reports, and export customisations remain yours. You grant Clyvro a licence to process them only to provide the service. Clyvro&apos;s software, ruleset, brand assets, and documentation remain the property of Founda Technologies. Do not scrape the service or copy the ruleset for a competing product without written permission.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">9. Security findings &amp; disclosure</h2>
      <p className="mt-2 text-sm">Hack Protection findings are safe, non-destructive external observations (headers, TLS dates, cookie flags, reachable sensitive paths). They are hypotheses for human review, not confirmed exploits. We welcome responsible disclosure of issues in Clyvro itself — see /.well-known/security.txt and /security for contact. We may act on confirmed abuse (e.g., suspend, ban, enable Under-Attack mode) and will log the action.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">10. Suspension, termination &amp; availability</h2>
      <p className="mt-2 text-sm">We provide the service &quot;as is&quot; and strive for high availability, but do not guarantee uninterrupted uptime. Scheduled maintenance, security responses, or provider incidents may cause brief interruptions; we aim to keep /admin and /api reachable even while public pages show maintenance. Either side may close an account at any time; we honour safe-deletion rules for shared workspaces. We may suspend for non-payment, terms violations, or to protect the platform — again, every action is audit-logged.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">11. Limitation of liability</h2>
      <p className="mt-2 text-sm">To the fullest extent allowed by law, Clyvro&apos;s liability for any claim arising from the service is limited to the fees you paid in the 12 months before the claim, and we are not liable for indirect, incidental, special, consequential, or punitive damages. Findings are advisory; verify before acting on them with clients or in production.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">12. Governing law &amp; disputes</h2>
      <p className="mt-2 text-sm">These Terms are governed by the laws of the jurisdiction where Founda Technologies is established (to be specified; this section will be updated once counsel confirms the proper seat and dispute venue). Until then, disputes should first be raised by email to admin.founda@gmail.com in good faith; if unresolved within 30 days, either party may pursue remedies available under applicable law.</p>
      <p className="mt-2 text-xs text-ink-mute">Business registration, registered address, and governing-law specifics are pending legal review and will be added before commercial launch — flagged explicitly here so nothing is invented.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">13. Contact</h2>
      <p className="mt-2 text-sm">General: admin.founda@gmail.com. Security disclosures: see /security. Updates to these Terms will be reflected in the date at the top of this page and, for material changes, announced via the site&apos;s notification system.</p></section>
  </div></div>); }
