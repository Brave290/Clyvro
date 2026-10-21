"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Inbox, LoaderCircle, Mail, MailWarning } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { TextField } from "@/components/auth/fields";

export default function ForgotPasswordForm({ mailReady }: { mailReady: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // The response is deliberately generic either way.
    } finally {
      setBusy(false);
      setDone(true);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgot your password?"
      lead="Enter your account email and we'll send a link to choose a new password. The link works once, for one hour."
      backHref="/sign-in"
      backLabel="Back to sign in"
      footer={<>Remembered it? <Link href="/sign-in" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Sign in</Link></>}
    >
      {!mailReady && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft p-3.5 text-sm leading-relaxed" role="status">
          <MailWarning size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span>Password reset by email isn&apos;t switched on yet on this deployment, so no email can be sent right now. If you signed up with Google, use “Continue with Google” instead; otherwise contact the workspace owner.</span>
        </p>
      )}

      {done ? (
        <div className="form-panel" role="status">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-good-soft text-good"><Inbox size={20} aria-hidden /></span>
          <h2 className="mt-4 text-lg font-semibold">Check your inbox</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            If an account exists for <strong className="text-ink">{email}</strong>, a reset link is on its way. Look in spam too — the link expires in one hour.
          </p>
          <button type="button" onClick={() => setDone(false)} className="button-secondary mt-5 w-full">Use a different email</button>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} className="form-panel space-y-4">
          <TextField
            id="fp-email" label="Email" icon={Mail} name="email" type="email" autoComplete="email" required inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
          />
          <button type="submit" disabled={busy || !email} className="button-primary button-primary-wide">
            {busy ? <><LoaderCircle size={15} className="animate-spin" aria-hidden /> Sending…</> : <>Send reset link <ArrowRight size={15} aria-hidden /></>}
          </button>
          <p className="text-xs leading-relaxed text-ink-mute">For your privacy we show the same confirmation whether or not an account exists.</p>
        </form>
      )}
    </AuthShell>
  );
}
