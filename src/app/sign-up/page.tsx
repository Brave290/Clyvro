"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

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
        headers: { "content-type": "application/json" },
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

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Create your free account</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Freemium includes 3 saved scans a month, 1 project, Generic Audit, and shareable reports.
        No credit card — paid billing isn&apos;t live yet (see <Link href="/pricing" className="font-semibold text-accent hover:underline">pricing</Link>).
      </p>
      <form onSubmit={submit} className="mt-6 rounded-2xl border border-line bg-surface p-6">
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
        )}
        <label htmlFor="su-name" className="text-sm font-medium">Your name</label>
        <input id="su-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <label htmlFor="su-org" className="mt-4 block text-sm font-medium">
          Business / workspace name <span className="font-normal text-ink-mute">(optional)</span>
        </label>
        <input id="su-org" type="text" autoComplete="organization" value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputCls} />
        <label htmlFor="su-email" className="mt-4 block text-sm font-medium">Email</label>
        <input id="su-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <label htmlFor="su-pass" className="mt-4 block text-sm font-medium">
          Password <span className="font-normal text-ink-mute">(at least 10 characters)</span>
        </label>
        <input id="su-pass" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        <button type="submit" disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover hover:shadow-md disabled:opacity-60">
          {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
          {busy ? "Creating account…" : "Create account"}
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
