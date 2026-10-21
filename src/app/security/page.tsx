import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security",
  description: "How Clyvro protects your data, and how to report a vulnerability.",
  alternates: { canonical: "/security" },
};

const CONTACT = process.env.SECURITY_CONTACT_EMAIL || "admin.founda@gmail.com";

/** Public security & responsible-disclosure page (linked from /.well-known/security.txt). */
export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="animate-fade-up text-4xl font-bold tracking-tight">Security at Clyvro</h1>
      <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-4 leading-relaxed text-ink-soft">
        Clyvro scans other people&apos;s websites for a living, so we hold ourselves to the standard we grade. This page explains what we do and how to tell us when we got something wrong.
      </p>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">What protects the platform</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">Clyvro Shield</strong> — our own edge firewall in front of every page and API: honeypot paths, attack-tool fingerprints and injection signatures are blocked, with escalating temporary bans for repeat offenders and sign-in lockouts against password guessing.</li>
          <li><strong className="text-ink">Privacy by design</strong> — Shield stores only salted hashes of addresses, never raw IPs; security events are pruned after seven days.</li>
          <li><strong className="text-ink">Hardened scanning</strong> — the scanner refuses private and internal network targets (SSRF guards), follows a bounded number of redirects, and identifies itself honestly with a <code>Clyvro</code> User-Agent.</li>
          <li><strong className="text-ink">Modern browser protections</strong> — a nonce-based Content-Security-Policy, HTTPS everywhere, HttpOnly session cookies, and passwords hashed with a slow, salted algorithm.</li>
          <li><strong className="text-ink">Least data</strong> — scans keep findings and evidence, not copies of your site; backups are encrypted at rest by the storage provider and restorable by the founder only.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">Reporting a vulnerability</h2>
        <p>If you believe you have found a security issue, e-mail <a className="font-semibold text-accent hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> with steps to reproduce. We read every report, reply within three working days, and credit researchers who want credit once a fix ships. Please give us reasonable time to fix before publishing.</p>
        <p>Please do <strong className="text-ink">not</strong> run automated scanners, denial-of-service tests or brute-force attempts against clyvro.vercel.app — Shield will ban the address, and it is not needed to demonstrate a finding. Test against your own accounts and data only.</p>
        <p>Machine-readable details live at <a className="font-semibold text-accent hover:underline" href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">If Shield blocked you by mistake</h2>
        <p>Blocks are temporary and expire on their own (15 minutes to 24 hours depending on what happened). If you keep seeing a &ldquo;Request blocked&rdquo; page while using Clyvro normally, send the time and the page you were on to the address above and we will clear it and tune the rule.</p>
      </section>
    </div>
  );
}
