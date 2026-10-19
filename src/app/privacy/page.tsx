import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy policy" };
export default function Privacy() { return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="text-4xl font-bold tracking-tight">Privacy policy</h1><p className="mt-2 text-sm text-ink-mute">Phase 1 prototype — last updated October 2026. This page will be replaced with a reviewed policy before any production launch.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">What this prototype collects</h2><p className="mt-2">This Phase 1 site has no accounts, no analytics trackers, and no server-side storage of personal data. The waitlist form saves your email in your own browser&apos;s local storage only; nothing is transmitted to us.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">When the product launches</h2><p className="mt-2">The audit product will store the URLs you submit and the resulting findings so you can revisit them. It will not sell personal data, and scanned websites will never receive your credentials or session cookies. A full policy covering processors, retention, and your rights will be published before launch.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Sample data</h2><p className="mt-2">The example report on this site uses a fictional website. No real website was scanned to produce it.</p></section>
  </div></div>); }
