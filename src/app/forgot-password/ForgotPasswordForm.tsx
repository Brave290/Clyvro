"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";

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
    <div className="mx-auto max-w-lg px-5 py-12 sm:py-16">
      <div className="mb-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={23} aria-hidden />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Enter your account email and we&apos;ll send a link to choose a new password. The link works for one hour, once.
        </p>
      </div>

      {!mailReady && (
        <p className="mb-4 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm leading-relaxed" role="status">
          Password reset by email isn&apos;t switched on yet on this deployment, so no email can be sent right now.
          If you signed up with Google, use “Continue with Google” instead; otherwise contact the workspace owner for help.
        </p>
      )}

      {done ? (
        <div className="form-panel space-y-3" role="status">
          <p className="rounded-xl border border-good/25 bg-good-soft p-4 text-sm leading-relaxed">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (and spam) — the link expires in one hour.
          </p>
          <p className="text-center text-sm">
            <Link href="/sign-in" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Back to sign in</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} className="form-panel space-y-4">
          <div>
            <label htmlFor="fp-email" className="form-label">Email</label>
            <input
              id="fp-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control mt-1.5"
            />
          </div>
          <button type="submit" disabled={busy} className="button-primary w-full">
            {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
            {busy ? "Sending…" : "Send reset link"}
            {!busy && <ArrowRight size={15} aria-hidden />}
          </button>
          <p className="text-center text-sm text-ink-soft">
            Remembered it?{" "}
            <Link href="/sign-in" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Sign in</Link>
          </p>
        </form>
      )}
    </div>
  );
}
