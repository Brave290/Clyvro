"use client";

import { useState } from "react";
import { CircleCheck, LoaderCircle, Send } from "lucide-react";
import { BrandSelect } from "./ui";
import { useToast } from "./Toast";

const ROLES = ["Agency / freelancer", "Developer", "SEO consultant", "Small business owner"];

/**
 * Waitlist — fully wired: signups are stored server-side and emailed
 * (confirmation to the user + a notification to the founder inbox via the
 * durable outbox). The success copy states exactly what happened,
 * including when email isn't configured yet.
 */
export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ already: boolean; mailPending: boolean } | null>(null);
  const { toast } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Please enter a valid work email.");
      toast("error", "That email doesn't look right", "Check the address and try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role, source: "homepage" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't join the waitlist just now.");
      setDone({
        already: Boolean(json.alreadyJoined),
        mailPending: json.emailDelivery !== "confirmation-queued",
      });
      toast("success", json.alreadyJoined ? "You're already on the list" : "You're on the waitlist", "We'll email you when your invite is ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join the waitlist just now.");
      toast("error", "Couldn't join the waitlist", "Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="animate-scale-in rounded-2xl border border-good/25 bg-good-soft p-5" role="status">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 shrink-0 text-good" size={20} aria-hidden="true" />
          <div>
            <p className="font-semibold text-good">{done.already ? "You're already on the list" : "You're on the waitlist"}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {done.already
                ? "We already have this email — no need to sign up twice. Your invite will land here when it's ready."
                : done.mailPending
                  ? "Your signup is saved. Our confirmation email is queued and will send as soon as email delivery is switched on."
                  : "Your signup is saved and a confirmation email is on its way. We'll email this address when your early-access invite is ready."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="form-panel" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <label htmlFor="wl-email" className="form-label">Work email</label>
          <input
            id="wl-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@agency.com"
            className="form-control mt-1.5"
            aria-invalid={!!error}
            aria-describedby={error ? "wl-error" : undefined}
          />
        </div>
        <div>
          <label htmlFor="wl-role" className="form-label">I am a…</label>
          <BrandSelect
            id="wl-role"
            value={role}
            onChange={setRole}
            options={ROLES.map((r) => ({ value: r, label: r }))}
            className="mt-1.5"
          />
        </div>
      </div>
      {error && <p id="wl-error" role="alert" className="form-error mt-3">{error}</p>}
      <button type="submit" disabled={busy} className="button-primary mt-4">
        {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />} Register interest
      </button>
      <p className="form-hint">No account is created. We store your email to send your invite and email you a confirmation — nothing else.</p>
    </form>
  );
}
