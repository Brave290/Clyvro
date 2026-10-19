"use client";
import { useState } from "react";
import { CircleCheck, Send } from "lucide-react";
export default function WaitlistForm() {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("Agency / freelancer");
  const [error, setError] = useState(""); const [done, setDone] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError("Please enter a valid work email."); return; }
    // Phase 1: no backend yet. Stored locally only — disclosed to the user below.
    const list = JSON.parse(localStorage.getItem("clyvro-waitlist") ?? "[]");
    list.push({ email, role, at: new Date().toISOString() });
    localStorage.setItem("clyvro-waitlist", JSON.stringify(list));
    setError(""); setDone(true);
  }
  if (done) return (<div className="flex items-start gap-3 rounded-2xl border border-good/25 bg-good-soft p-5" role="status">
    <CircleCheck className="mt-0.5 shrink-0 text-good" size={20} />
    <div><p className="font-semibold text-good">Interest registered (demo)</p>
    <p className="mt-1 text-sm leading-relaxed text-ink-soft">Thank you. Note: this Phase 1 prototype has no mailing backend yet, so your email was saved only in this browser — nothing was transmitted. Pilot invites open with the Phase 3 MVP.</p></div></div>);
  return (<form onSubmit={submit} className="rounded-2xl border border-line bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]" noValidate>
    <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
      <div><label htmlFor="wl-email" className="text-sm font-medium">Work email</label>
        <input id="wl-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" className="mt-1.5 w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25" aria-invalid={!!error} aria-describedby={error ? "wl-error" : undefined} /></div>
      <div><label htmlFor="wl-role" className="text-sm font-medium">I am a…</label>
        <select id="wl-role" value={role} onChange={e => setRole(e.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25">
          <option>Agency / freelancer</option><option>SEO consultant</option><option>Small business owner</option><option>Other</option></select></div>
    </div>
    {error && <p id="wl-error" role="alert" className="mt-2 text-sm font-medium text-bad">{error}</p>}
    <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-deep"><Send size={15} /> Register interest</button>
    <p className="mt-3 text-xs leading-relaxed text-ink-mute">Phase 1 demo: no account is created and nothing leaves your browser yet. We&apos;ll say exactly that until the real pilot opens.</p>
  </form>);
}
