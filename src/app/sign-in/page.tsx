"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LoaderCircle } from "lucide-react";

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
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError("Email or password didn't match. Try again.");
    } else {
      const next = params.get("callbackUrl");
      router.push(next && next.startsWith("/app") ? next : "/app");
      router.refresh();
    }
  }

  const justRegistered = params.get("registered") === "1";

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Access your projects, saved audits, comparisons, and share links.
      </p>
      {justRegistered && (
        <p role="status" className="mt-4 rounded-xl border border-good/25 bg-good-soft p-4 text-sm">
          Account created. Sign in with your new credentials.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 rounded-2xl border border-line bg-surface p-6">
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
        )}
        <label htmlFor="si-email" className="text-sm font-medium">Email</label>
        <input id="si-email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25" />
        <label htmlFor="si-pass" className="mt-4 block text-sm font-medium">Password</label>
        <input id="si-pass" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25" />
        <button type="submit" disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover hover:shadow-md disabled:opacity-60">
          {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-soft">
        New to Clyvro? <Link href="/sign-up" className="font-semibold text-accent hover:underline">Create a free account</Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-5 py-16 text-sm text-ink-mute">Loading…</div>}>
      <SignInInner />
    </Suspense>
  );
}
