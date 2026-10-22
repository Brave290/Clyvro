"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, LoaderCircle, Lock, Mail, UserRound } from "lucide-react";
import { deviceSignal, DEVICE_HEADER } from "@/lib/device";
import GoogleButton from "@/components/auth/GoogleButton";
import AuthShell from "@/components/auth/AuthShell";
import { PasswordField, TextField, passwordStrength } from "@/components/auth/fields";
import { stashAuthToast } from "@/components/AuthToast";

const INCLUDED = ["10 free checks a month", "We show you what's broken", "Shareable report links", "No card needed"];

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);
  const canSubmit = email.includes("@") && password.length >= 10 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError("Choose a password of at least 10 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", [DEVICE_HEADER]: deviceSignal() },
        body: JSON.stringify({ name, organizationName: orgName, email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Registration failed. Please try again.");
      stashAuthToast("Account created", "Welcome to Clyvro — sign in to run your first saved scan.");
      router.push("/sign-in?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Start free — no card"
      title="Create your free account"
      lead={<>Free lets you check your real site and see what's broken. Upgrade later from Billing if it helps — see <Link href="/pricing" className="font-semibold text-accent hover:underline">pricing</Link>.</>}
      footer={<>Already have an account? <Link href="/sign-in" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Sign in</Link></>}
    >
      <ul className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-ink-soft">
        {INCLUDED.map((item) => (
          <li key={item} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden />{item}</li>
        ))}
      </ul>

      <div className="form-panel">
        <GoogleButton />
        <form onSubmit={submit} aria-busy={busy} className="space-y-4" noValidate>
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="su-name" label="Your name" icon={UserRound} name="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
            <TextField id="su-org" label="Workspace" icon={Building2} optional name="organization" type="text" autoComplete="organization" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Studio or company" />
          </div>
          <TextField
            id="su-email" label="Email" icon={Mail} name="email" type="email" autoComplete="email" required inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
          />
          <PasswordField
            id="su-pass" label="Password" icon={Lock} name="password" autoComplete="new-password" required minLength={10} meter
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters"
            hint={!password ? "Use 10+ characters. A short sentence you'll remember works well." : undefined}
          />
          <button type="submit" disabled={!canSubmit} className="button-primary button-primary-wide">
            {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Creating account…</> : <>Create account <ArrowRight size={16} aria-hidden /></>}
          </button>
          <p className="text-xs leading-relaxed text-ink-mute">
            Passwords are hashed with scrypt and never stored in plain text{strength.score >= 3 ? " — nice password, by the way" : ""}. By creating an account you agree to the{" "}
            <Link href="/terms" className="font-semibold text-accent hover:underline">terms</Link> and acknowledge the{" "}
            <Link href="/privacy" className="font-semibold text-accent hover:underline">privacy policy</Link>.
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
