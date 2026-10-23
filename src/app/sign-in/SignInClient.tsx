"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, CircleCheck, LoaderCircle, Lock, Mail } from "lucide-react";
import GoogleButton from "@/components/auth/GoogleButton";
import AuthShell from "@/components/auth/AuthShell";
import { PasswordField, TextField } from "@/components/auth/fields";
import AuthToast, { stashAuthToast } from "@/components/AuthToast";

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const callbackUrl = params.get("callbackUrl");
  const destination = callbackUrl && (callbackUrl.startsWith("/app") || callbackUrl.startsWith("/admin")) ? callbackUrl : "/app/scan";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError("Email or password didn't match. Try again, or reset your password below.");
      } else {
        stashAuthToast("Welcome back", "You're signed in. Good to see you again.");
        router.push(destination);
        router.refresh();
      }
    } catch {
      setError("We couldn't sign you in just now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const notice = params.get("registered") === "1"
    ? "Account created. Sign in with your new credentials."
    : params.get("reset") === "1"
      ? "Password updated. Sign in with your new password."
      : null;

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Clyvro"
      lead="See your sites, what's broken, and what's fixed."
      footer={<>New to Clyvro? <Link href="/sign-up" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Create a free account</Link></>}
    >
      <AuthToast />
      {notice && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-good/25 bg-good-soft p-3.5 text-sm leading-relaxed">
          <CircleCheck size={16} className="mt-0.5 shrink-0 text-good" aria-hidden /> {notice}
        </p>
      )}

      <div className="form-panel">
        <GoogleButton callbackUrl={destination} />
        <form onSubmit={submit} aria-busy={busy} className="space-y-4" noValidate>
          {error && <p role="alert" className="form-error">{error}</p>}
          <TextField
            id="si-email" label="Email" icon={Mail} name="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" inputMode="email"
          />
          <PasswordField
            id="si-pass" label="Password" icon={Lock} name="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password"
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-xs text-ink-mute">Sessions stay signed in on this device.</span>
            <Link href="/forgot-password" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={busy || !email || !password} className="button-primary button-primary-wide">
            {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Signing in…</> : <>Sign in <ArrowRight size={16} aria-hidden /></>}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

export default function SignInClient() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center px-5" aria-busy="true"><div className="w-full max-w-lg"><div className="text-3xl font-bold tracking-tight" aria-hidden="true">Sign in to Clyvro</div><div className="mt-6 h-80 animate-pulse rounded-3xl bg-line/50" /></div></div>}>
      <SignInInner />
    </Suspense>
  );
}
