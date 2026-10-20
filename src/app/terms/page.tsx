import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms of service" };
export default function Terms() { return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="animate-fade-up text-4xl font-bold tracking-tight">Terms of service</h1>
  <p className="mt-2 text-sm text-ink-mute">Last updated October 2026. Full terms will be published and reviewed before any commercial launch.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">The service</h2>
      <p className="mt-2">Clyvro provides a bounded, evidence-first website scanner. It is a functional prototype: scans are rate-limited, results are not saved, and features will change as development phases complete.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Responsible &amp; authorized use</h2>
      <p className="mt-2">Only submit websites you own or are authorized to assess. The scanner refuses private-network and internal destinations by design and enforces strict page, depth, size, and time limits. You must not attempt to circumvent these protections or use Clyvro to probe systems you have no right to test. We may block abusive traffic without notice.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Findings &amp; no outcome guarantees</h2>
      <p className="mt-2">Findings describe observed technical conditions within a scan&apos;s stated coverage. Heuristic findings are inferences for human review, not confirmed defects. Audit scores are internal prioritisation measures — Clyvro does not guarantee any change in traffic, conversions, or revenue from acting on a report.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Availability</h2>
      <p className="mt-2">The prototype is provided “as is” without warranties of availability or accuracy. Verify important findings before acting on them with clients.</p></section>
  </div></div>); }
