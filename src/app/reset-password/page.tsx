"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't reset the password. Request a new link.");
      router.push("/sign-in?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password. Request a new link.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12 sm:py-16">
      <div className="mb-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={23} aria-hidden />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Pick a strong password you don&apos;t use elsewhere. This link can be used once.
        </p>
      </div>

      {!token ? (
        <div className="form-panel space-y-3" role="alert">
          <p className="form-error">This page needs the full reset link from your email — the code is missing.</p>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Request a new link</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} className="form-panel space-y-4">
          {error && <p role="alert" className="form-error">{error}</p>}
          <div>
            <label htmlFor="rp-password" className="form-label">New password</label>
            <input
              id="rp-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-control mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="rp-confirm" className="form-label">Repeat new password</label>
            <input
              id="rp-confirm"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="form-control mt-1.5"
            />
          </div>
          <button type="submit" disabled={busy} className="button-primary w-full">
            {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
            {busy ? "Saving…" : "Set new password"}
          </button>
          <p className="text-center text-sm text-ink-soft">
            Link expired?{" "}
            <Link href="/forgot-password" className="inline-flex min-h-6 items-center font-semibold text-accent hover:underline">Request a new one</Link>
          </p>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-5 py-16" aria-busy="true"><div className="h-72 animate-pulse rounded-3xl bg-line/50" /></div>}>
      <ResetInner />
    </Suspense>
  );
}
