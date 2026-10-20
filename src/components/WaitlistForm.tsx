"use client";

import { useState } from "react";
import { CircleCheck, Send } from "lucide-react";
import { BrandSelect } from "./ui";
import { useToast } from "./Toast";

const ROLES = ["Agency / freelancer", "Developer", "SEO consultant", "Small business owner"];

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Please enter a valid work email.");
      toast("error", "That email doesn't look right", "Check the address and try again.");
      return;
    }
    // There is no mailing backend yet. Keep the disclosure explicit and do not
    // imply that the locally stored interest was sent to a person or service.
    const list = JSON.parse(localStorage.getItem("clyvro-waitlist") ?? "[]");
    list.push({ email, role, at: new Date().toISOString() });
    localStorage.setItem("clyvro-waitlist", JSON.stringify(list));
    setError("");
    setDone(true);
    toast("success", "Saved on this device", "Nothing was sent to a mailing list.");
  }

  if (done) {
    return (
      <div className="animate-scale-in rounded-2xl border border-good/25 bg-good-soft p-5" role="status">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 shrink-0 text-good" size={20} aria-hidden="true" />
          <div>
            <p className="font-semibold text-good">Saved on this device</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Thanks for your interest. Early-access registration is not connected to a mailing service yet;
              this entry is stored only in this browser and was not sent anywhere.
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
      <button type="submit" className="button-primary mt-4"><Send size={15} aria-hidden="true" /> Register interest</button>
      <p className="form-hint">No account is created. Details stay in this browser; this form does not send anything.</p>
    </form>
  );
}
