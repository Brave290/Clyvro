"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, LoaderCircle, Lock, Mail, UserRound } from "lucide-react";
import { deviceSignal, DEVICE_HEADER } from "@/lib/device";
import GoogleButton from "@/components/auth/GoogleButton";
import AuthShell from "@/components/auth/AuthShell";
import { PasswordField, TextField, passwordStrength } from "@/components/auth/fields";
import { stashAuthToast } from "@/components/AuthToast";

const STEPS = ["Email", "Password", "You"] as const;

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 0) {
      if (!email.includes("@")) { setError("Enter a real email address."); return; }
      setError(null);
      setStep(1);
      return;
    }
    if (step === 1) {
      if (password.length < 10) { setError("Choose a password of at least 10 characters."); return; }
      setError(null);
      setStep(2);
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
      lead={<>Step {step + 1} of 3 · see <Link href="/pricing" className="font-semibold text-accent hover:underline">pricing</Link> anytime.</>}
      footer={<>Already have an account? <Link href="/sign-in" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Sign in</Link></>}
    >
      <ol className="mb-4 flex gap-1.5" aria-label="Sign-up steps">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <span className={`block h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
            <span className={`mt-1.5 block text-[11px] font-semibold ${i === step ? "text-ink" : "text-ink-mute"}`}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="form-panel">
        {step === 0 && <GoogleButton />}
        <form onSubmit={submit} aria-busy={busy} className="space-y-4" noValidate>
          {error && <p role="alert" className="form-error">{error}</p>}
          {step === 0 && (
            <TextField
              id="su-email" label="Email" icon={Mail} name="email" type="email" autoComplete="email" required inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
            />
          )}
          {step === 1 && (
            <PasswordField
              id="su-pass" label="Password" icon={Lock} name="password" autoComplete="new-password" required minLength={10} meter
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters"
              hint={!password ? "Use 10+ characters. A short sentence you'll remember works well." : undefined}
            />
          )}
          {step === 2 && (
            <>
              <TextField id="su-name" label="Your name" icon={UserRound} optional name="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
              <TextField id="su-org" label="Workspace" icon={Building2} optional name="organization" type="text" autoComplete="organization" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Studio or company" />
              <p className="text-xs leading-relaxed text-ink-mute">
                You can skip both and fill them in later. Passwords are hashed with scrypt
                {strength.score >= 3 ? " — nice password, by the way" : ""}. By creating an account you agree to the{" "}
                <Link href="/terms" className="font-semibold text-accent hover:underline">terms</Link> and acknowledge the{" "}
                <Link href="/privacy" className="font-semibold text-accent hover:underline">privacy policy</Link>.
              </p>
            </>
          )}
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" className="button-secondary" onClick={() => { setError(null); setStep((s) => s - 1); }}>
                <ArrowLeft size={16} aria-hidden /> Back
              </button>
            )}
            <button type="submit" disabled={busy || (step === 0 && !email.includes("@")) || (step === 1 && password.length < 10)} className="button-primary button-primary-wide">
              {busy
                ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Creating account…</>
                : step === 2
                  ? <>Create account <ArrowRight size={16} aria-hidden /></>
                  : <>Continue <ArrowRight size={16} aria-hidden /></>}
            </button>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
