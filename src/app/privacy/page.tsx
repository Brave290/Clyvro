import type { Metadata } from "next";
import { getPublishedLegal } from "@/lib/services/legal";
import LegalPageView from "@/components/LegalPageView";
export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Clyvro handles your data: what we collect when you scan a website, what we never store, and your choices.",
  alternates: { canonical: "/privacy" },
};
export const dynamic = "force-dynamic";
export default async function Privacy() {
  const published = await getPublishedLegal("privacy");
  if (published.body) return <LegalPageView title={published.title} body={published.body} publishedAt={published.publishedAt} />;
  return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="animate-fade-up text-4xl font-bold tracking-tight">Privacy policy</h1>
  <p className="mt-2 text-sm text-ink-mute">Last updated 22 October 2026. Effective 22 October 2026.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">1. Who we are</h2>
      <p className="mt-2">Clyvro is an evidence-first website auditing platform operated by <strong className="text-ink">Founda Technologies</strong>. Questions about this policy: <a href="mailto:admin.founda@gmail.com" className="font-semibold text-accent hover:underline">admin.founda@gmail.com</a>. We have not published a separate Data Protection Officer contact; the same address handles all privacy requests for now. If a formal DPO or representative is appointed, this page will be updated.</p>
      <p className="mt-2 text-xs text-ink-mute">Business address, registration number, and DPO details: pending — will be added before commercial launch. This policy covers the service as it runs today.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">2. Information we collect and why</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li><strong className="text-ink">Account registration:</strong> name, email, hashed password (scrypt via Auth.js Credentials), email-verification state. Purpose: create and secure your account. We never store raw passwords.</li>
        <li><strong className="text-ink">Google sign-in:</strong> when you use Google via Firebase Authentication, we receive your verified email and display name from Google; we link them to the existing workspace by verified email. The Firebase ID token is verified server-side against Google JWKS. Google provider tokens are not stored.</li>
        <li><strong className="text-ink">Website scans:</strong> URLs you submit, crawl results, findings, page snapshots (HTML metadata only, no full page storage beyond evidence snippets). Purpose: deliver audit reports. Scans of your own sites require DNS-verified ownership for Deep mode.</li>
        <li><strong className="text-ink">Cron jobs:</strong> target URL, method, schedule, run history (status, headers redacted, first 8 KB body). Purpose: execute your scheduled HTTP calls.</li>
        <li><strong className="text-ink">Security events (Clyvro Shield):</strong> salted SHA-256 hashes of IP and account identifier, masked IP label, verdict, rule, truncated path/query, mode. Retained 7 days, then pruned. Purpose: detect and respond to abuse.</li>
        <li><strong className="text-ink">Billing:</strong> plan, quota usage events, payment status via Flutterwave (amount/currency verified server-side; transaction re-verified against Flutterwave API). Flutterwave handles card data — we never see it.</li>
        <li><strong className="text-ink">Team &amp; invitations:</strong> invite email, role, acceptance state. Purpose: collaborate in shared workspaces.</li>
        <li><strong className="text-ink">Support / waitlist / feature requests:</strong> email, message, votes. Purpose: onboarding and product improvement.</li>
      </ul></section>
    <section><h2 className="text-lg font-semibold text-ink">3. Cookies &amp; sessions</h2>
      <p className="mt-2 text-sm">Essential cookies only: the Auth.js session cookie (HttpOnly, Secure in production, SameSite=Lax), the Clyvro Shield trusted-browser cookie (HMAC-signed, 30-day TTL, HttpOnly, Secure in production), and your theme preference. There are no analytics or advertising cookies. You can clear cookies, but clearing the session cookie signs you out.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">4. Third-party services &amp; processors</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li><strong className="text-ink">Vercel</strong> — hosting and edge delivery.</li>
        <li><strong className="text-ink">Neon</strong> — Postgres database (pooled).</li>
        <li><strong className="text-ink">Firebase (Google)</strong> — Google sign-in token issuance; verification is server-side.</li>
        <li><strong className="text-ink">Flutterwave</strong> — payment processing.</li>
        <li><strong className="text-ink">Cloudflare R2</strong> — encrypted workspace backups (when configured).</li>
        <li><strong className="text-ink">Browserless / Playwright WS</strong> — optional remote browser for Flow Scan.</li>
        <li><strong className="text-ink">SMTP provider</strong> — transactional email (password reset, notifications). Configured via SMTP_URL/HOST.</li>
        <li><strong className="text-ink">GitHub</strong> — Code Reviewer webhook/App (when installed).</li>
      </ul>
      <p className="mt-2 text-sm">A fuller Data Processing Addendum will be published before enterprise contracts. Current processors are listed honestly above — if one is not configured, the corresponding feature is disabled and never claims to work.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">5. How we share (and don&apos;t share) data</h2>
      <p className="mt-2 text-sm">We do not sell personal data or share reports with anyone except via share links you create. Data is disclosed to processors above only as needed to provide the service. We may disclose if required by law or to prevent serious abuse; we will record any such disclosure in our audit log where legally allowed.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">6. Retention &amp; deletion</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Account and workspace records: until you delete them. Delete-account (Settings) uses safe-deletion rules — sole-owner workspaces are removed with their scans; shared history is retained under the remaining owner.</li>
        <li>Scans and findings: tied to the workspace; deleted with it.</li>
        <li>Security events: 7 days.</li>
        <li>Bans: until expiry, then pruned after 24 h.</li>
        <li>Outbox notifications: until delivered or skipped, then marked; no separate retention beyond the row itself.</li>
        <li>Audit log: retained for platform administration (visible at /admin/audit-log).</li>
      </ul></section>
    <section><h2 className="text-lg font-semibold text-ink">7. Your rights</h2>
      <p className="mt-2 text-sm">You can access your data in the dashboard (account, scans, reports, team). To request access, correction, export, or deletion — or to object to processing — email us. For Google sign-in data, you can also revoke access at myaccount.google.com/permissions. We respond to qualified requests within 30 days where feasible.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">8. Security practices &amp; limits</h2>
      <p className="mt-2 text-sm">Passwords are scrypt-hashed; reset tokens are one-time SHA-256-hashed and expire in 1 h. Shield, rate limits, and login lockouts protect sign-in; Trusted-browser cookies are HMAC-signed and revocable. SSRF protections block private/internal targets. Nothing here makes a site &quot;un-hackable&quot; — we disclose limits honestly in the product, and responsibly reported issues are welcomed via the contact on /security and /.well-known/security.txt.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">9. International transfers</h2>
      <p className="mt-2 text-sm">Data is processed where our providers operate (Vercel/Neon regions; Firebase Google infrastructure; Flutterwave payment region). If you are outside that scope, submitting data implies you accept those transfers as needed to deliver the service.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">10. Changes &amp; contact</h2>
      <p className="mt-2 text-sm">We will update the date at the top of this page and, for material changes, notify signed-in users via the notification outbox. Continued use after a change means you accept the new terms. Contact: admin.founda@gmail.com.</p></section>
  </div></div>); }
