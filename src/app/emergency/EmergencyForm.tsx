"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { KeyRound, LoaderCircle, Lock, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { PasswordField, TextField } from "@/components/auth/fields";
import { stashAuthToast } from "@/components/AuthToast";

type Phase = "idle" | "verifying" | "session" | "done";

export default function EmergencyForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/emergency/login", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setKeyConfigured(Boolean(j?.keyConfigured)); })
      .catch(() => { if (alive) setKeyConfigured(false); });
    return () => { alive = false; };
  }, []);

  const busy = phase === "verifying" || phase === "session";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password && !key) {
      setError("Enter your password or the emergency key.");
      return;
    }
    setPhase("verifying");
    try {
      const res = await fetch("/api/emergency/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, key }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; token?: string; unbannedIp?: boolean; error?: { message?: string } } | null;
      if (!res.ok || !data?.token) {
        throw new Error(data?.error?.message ?? "Those details were not accepted.");
      }
      setPhase("session");
      // The trusted-browser cookie is already set, so this sign-in passes
      // Shield even if the address was banned a second ago.
      const result = await signIn("firebase-bridge", { token: data.token, redirect: false });
      if (result?.error) throw new Error("Verified, but the session handoff failed. Reload and try once more.");
      setPhase("done");
      stashAuthToast("Emergency access granted", data.unbannedIp ? "Your address was un-banned and this browser is now trusted." : "This browser is now trusted by Shield for 30 days.");
      window.location.assign("/admin/security");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Those details were not accepted.");
    }
  }

  return (
    <AuthShell
      tone="emergency"
      eyebrow="Administrator emergency access"
      title="Get back into Clyvro"
      lead="For platform administrators only. Prove it is you with your account password or the emergency key set in the hosting dashboard."
      backHref="/sign-in"
      backLabel="Normal sign in"
    >
      <div className="form-panel">
        <form onSubmit={submit} aria-busy={busy} className="space-y-4" noValidate>
          {error && <p role="alert" className="form-error">{error}</p>}
          <TextField
            id="em-email" label="Administrator email" icon={Mail} name="email" type="email" autoComplete="username" required inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
          />
          <PasswordField
            id="em-pass" label="Account password" icon={Lock} name="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave empty if you only use Google"
          />
          <PasswordField
            id="em-key" label="Emergency key" icon={KeyRound} name="key" autoComplete="off"
            value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyConfigured === false ? "Not configured on this deployment" : "ADMIN_EMERGENCY_KEY"}
            hint={keyConfigured === false
              ? "No emergency key is set (ADMIN_EMERGENCY_KEY). Password sign-in still works here; add a 32+ character key in Vercel to cover Google-only accounts."
              : "Either the password or the key is enough. Google-only accounts use the key."}
          />
          <button type="submit" disabled={busy || !email} className="button-primary button-primary-wide">
            {phase === "verifying" ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Verifying…</>
              : phase === "session" ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Opening session…</>
                : phase === "done" ? <><ShieldCheck size={16} aria-hidden /> Redirecting…</>
                  : <><ShieldAlert size={16} aria-hidden /> Unlock administrator access</>}
          </button>
          <p className="text-xs leading-relaxed text-ink-mute">
            Every attempt is recorded in the security log with a masked address. Five failures per address in 15 minutes close this door for that address; ten password failures for one account close the password path for 15 minutes (the emergency key keeps working). The normal sign-in lockout never blocks this door.
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
