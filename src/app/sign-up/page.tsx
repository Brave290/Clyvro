"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, UserRoundPlus } from "lucide-react";
import { deviceSignal, DEVICE_HEADER } from "@/lib/device";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      router.push("/sign-in?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12 sm:py-16">
      <div className="mb-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <UserRoundPlus size={23} aria-hidden />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Start with the evidence</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Create your free account</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Freemium includes 3 saved scans a month, 1 project, Generic Audit, and shareable reports.
          No credit card — paid billing isn&apos;t live yet (see <Link href="/pricing" className="font-semibold text-accent hover:underline">pricing</Link>).
        </p>
      </div>

      <form onSubmit={submit} aria-busy={busy} className="form-panel space-y-4">
        {error && <p role="alert" className="form-error">{error}</p>}
        <div>
          <label htmlFor="su-name" className="form-label">Your name</label>
          <input
            id="su-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-control mt-1.5"
          />
        </div>
        <div>
          <label htmlFor="su-org" className="form-label">
            Business / workspace name <span className="font-normal text-ink-mute">(optional)</span>
          </label>
          <input
            id="su-org"
            type="text"
            autoComplete="organization"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="form-control mt-1.5"
          />
        </div>
        <div>
          <label htmlFor="su-email" className="form-label">Email <span className="text-bad" aria-hidden="true">*</span></label>
          <input
            id="su-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-control mt-1.5"
          />
        </div>
        <div>
          <label htmlFor="su-pass" className="form-label">
            Password <span className="text-bad" aria-hidden="true">*</span>{" "}
            <span className="font-normal text-ink-mute">(at least 10 characters)</span>
          </label>
          <input
            id="su-pass"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-control mt-1.5"
          />
        </div>
        <button type="submit" disabled={busy} className="button-primary button-primary-wide mt-1">
          {busy ? <><LoaderCircle size={16} className="animate-spin" aria-hidden /> Creating account…</> : <>Create account <ArrowRight size={16} aria-hidden /></>}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-ink-mute">
          Passwords are hashed with scrypt and never stored in plain text. By creating an account you agree to the{" "}
          <Link href="/terms" className="font-semibold text-accent hover:underline">terms</Link> and acknowledge the{" "}
          <Link href="/privacy" className="font-semibold text-accent hover:underline">privacy policy</Link>.
        </p>
      </form>

      <p className="mt-4 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/sign-in" className="font-semibold text-accent hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
