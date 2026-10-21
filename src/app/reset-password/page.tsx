"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LoaderCircle, Lock } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/fields";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Choose a password of at least 10 characters.");
      return;
    }
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
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      lead="Pick a strong password you don't use anywhere else. This link can be used once."
      backHref="/sign-in"
      backLabel="Back to sign in"
      footer={<>Link expired? <Link href="/forgot-password" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Request a new one</Link></>}
    >
      {!token ? (
        <div className="form-panel space-y-4" role="alert">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-bad-soft text-bad"><KeyRound size={20} aria-hidden /></span>
          <p className="form-error">This page needs the full reset link from your email — the code is missing.</p>
          <Link href="/forgot-password" className="button-secondary w-full">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} className="form-panel space-y-4" noValidate>
          {error && <p role="alert" className="form-error">{error}</p>}
          <PasswordField
            id="rp-password" label="New password" icon={Lock} name="password" autoComplete="new-password" required minLength={10} meter
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters"
          />
          <PasswordField
            id="rp-confirm" label="Repeat new password" icon={Lock} name="confirm-password" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again"
            error={mismatch ? "These don't match yet." : null}
          />
          <button type="submit" disabled={busy || !password || !confirm || mismatch} className="button-primary button-primary-wide">
            {busy ? <><LoaderCircle size={15} className="animate-spin" aria-hidden /> Saving…</> : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-5 py-16" aria-busy="true"><div className="h-72 animate-pulse rounded-3xl bg-line/50" /></div>}>
      <ResetInner />
    </Suspense>
  );
}
