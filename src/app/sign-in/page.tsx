"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import GoogleButton from "@/components/auth/GoogleButton";
import AuthShell from "@/components/auth/AuthShell";
import AuthToast, { stashAuthToast } from "@/components/AuthToast";

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError("Email or password didn't match. Try again.");
      } else {
        const next = params.get("callbackUrl");
        stashAuthToast("Welcome back", "You're signed in. Good to see you again.");
        // Default landing after sign-in is the Scan tab — the one job
        // most people open Clyvro to do.
        router.push(next && next.startsWith("/app") ? next : "/app/scan");
        router.refresh();
      }
    } catch {
      setError("We couldn't sign you in just now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const justRegistered = params.get("registered") === "1";
  const justReset = params.get("reset") === "1";

  return (
    <AuthShell>
      <AuthToast />
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Sign in to Clyvro</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Pick up where you left off with your websites, evidence-backed checks, and client reports.
        </p>
      </div>

      {justRegistered && (
        <p role="status" className="mb-4 rounded-xl border border-good/25 bg-good-soft p-4 text-sm">
          Account created. Sign in with your new credentials.
        </p>
      )}
      {justReset && (
        <p role="status" className="mb-4 rounded-xl border border-good/25 bg-good-soft p-4 text-sm">
          Password updated. Sign in with your new password.
        </p>
      )}

      <GoogleButton />

      <form onSubmit={submit} aria-busy={busy} className="form-panel space-y-4">
        {error && <p role="alert" className="form-error">{error}</p>}
        <div>
          <label htmlFor="si-email" className="form-label">Email</label>
          <input
            id="si-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-control mt-1.5"
          />
        </div>
        <div>
          <label htmlFor="si-pass" className="form-label">Password</label>
          <input
            id="si-pass"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-control mt-1.5"
          />
        </div>
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Forgot your password?</Link>
        </p>
        <button type="submit" disabled={busy} className="button-primary button-primary-wide mt-1">
          {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Signing in…</> : <>Sign in <ArrowRight size={16} aria-hidden /></>}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        New to Clyvro? <Link href="/sign-up" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Create a free account</Link>
      </p>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-5 py-16" aria-busy="true"><div className="text-3xl font-bold tracking-tight" aria-hidden="true">Sign in to Clyvro</div><div className="mt-6 h-80 animate-pulse rounded-3xl bg-line/50" /></div>}>
      <SignInInner />
    </Suspense>
  );
}
