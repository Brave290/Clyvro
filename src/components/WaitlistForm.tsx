"use client";
import { useState } from "react";
import { CircleCheck, Send, Mail } from "lucide-react";
import { BrandSelect } from "./ui";
import { useToast } from "./Toast";

const FOUNDER_EMAIL = "legateakanjimusab@gmail.com";
const ROLES = ["Agency / freelancer", "Developer", "SEO consultant", "Small business owner"];

export default function WaitlistForm() {
  const [email, setEmail] = useState(""); const [role, setRole] = useState(ROLES[0]);
  const [error, setError] = useState(""); const [done, setDone] = useState(false);
  const { toast } = useToast();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Please enter a valid work email.");
      toast("error", "That email doesn't look right", "Check the address and try again.");
      return;
    }
    // No mailing backend yet. Stored locally, with an optional
    // direct-to-founder email confirmation — both disclosed to the user.
    const list = JSON.parse(localStorage.getItem("clyvro-waitlist") ?? "[]");
    list.push({ email, role, at: new Date().toISOString() });
    localStorage.setItem("clyvro-waitlist", JSON.stringify(list));
    setError(""); setDone(true);
    toast("success", "Interest registered", "One more step below makes sure the founder receives it.");
  }
  if (done) {
    const mailto = `mailto:${FOUNDER_EMAIL}?subject=${encodeURIComponent("Clyvro Dev early-access signup")}&body=${encodeURIComponent(`Hi, I'd like to join Clyvro Dev early access.\n\nEmail: ${email}\nRole: ${role}`)}`;
    return (<div className="animate-scale-in rounded-2xl border border-good/25 bg-good-soft p-5" role="status">
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 shrink-0 text-good" size={20} />
        <div><p className="font-semibold text-good">Interest registered</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">Thank you. There&apos;s no mailing backend yet, so your details were saved only in this browser. To make sure the founder actually receives your signup today, send it by email:</p></div></div>
      <a href={mailto} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0"><Mail size={15} /> Confirm by email — {FOUNDER_EMAIL}</a>
    </div>);
  }
  return (<form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]" noValidate>
    <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
      <div><label htmlFor="wl-email" className="text-sm font-medium">Work email</label>
        <input id="wl-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition duration-200 hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25" aria-invalid={!!error} aria-describedby={error ? "wl-error" : undefined} /></div>
      <div><label htmlFor="wl-role" className="text-sm font-medium">I am a…</label>
        <BrandSelect
          id="wl-role"
          value={role}
          onChange={setRole}
          options={ROLES.map((r) => ({ value: r, label: r }))}
          className="mt-1.5"
        /></div>
    </div>
    {error && <p id="wl-error" role="alert" className="animate-fade-in mt-2 text-sm font-medium text-bad">{error}</p>}
    <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0"><Send size={15} /> Register interest</button>
    <p className="mt-3 text-xs leading-relaxed text-ink-mute">No account is created. Your details stay in this browser unless you choose the email confirmation to the founder ({FOUNDER_EMAIL}) on the next step.</p>
  </form>);
}
