import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms of service" };
export default function Terms() { return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="text-4xl font-bold tracking-tight">Terms of service</h1><p className="mt-2 text-sm text-ink-mute">Phase 1 prototype — last updated October 2026. Full terms will be published and reviewed before any production launch.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">This is a demonstration site</h2><p className="mt-2">Clyvro&apos;s scanner is under development. The reports shown here use clearly labelled sample data and do not describe any real website.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Responsible scanning (planned service)</h2><p className="mt-2">When scanning launches, users may only submit websites they own or are authorised to assess. The scanner will refuse private-network destinations and enforce strict rate and depth limits.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">No outcome guarantees</h2><p className="mt-2">Audit findings describe observed technical conditions. Clyvro does not guarantee any change in traffic, conversions, or revenue from acting on them.</p></section>
  </div></div>); }
