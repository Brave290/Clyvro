"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LoaderCircle, ShieldAlert } from "lucide-react";

/**
 * Landing page after a Neon Auth sign-in. Exchanges the Neon session for
 * the normal Clyvro app session via the bridge, then continues to the
 * app. Any failure is shown plainly with the email fallback.
 */
function NeonCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // The Neon session cookie lives on the Neon Auth domain, so the
        // browser first proves the session there (credentialed cross-site
        // request) and fetches the session JWT, which our server then
        // verifies against Neon's JWKS. Falls back to the cookie-forward
        // bridge when the JWT endpoint isn't available.
        let neonJwt: string | null = null;
        try {
          const statusRes = await fetch("/api/auth/providers-status");
          const status = (await statusRes.json().catch(() => null)) as { neonAuthBaseUrl?: string | null } | null;
          const base = status?.neonAuthBaseUrl?.replace(/\/+$/, "");
          if (base) {
            const sessionRes = await fetch(`${base}/get-session`, { credentials: "include", cache: "no-store" });
            if (sessionRes.ok) {
              const tokenRes = await fetch(`${base}/token`, { credentials: "include", cache: "no-store" });
              const tokenJson = (await tokenRes.json().catch(() => null)) as { token?: string } | null;
              if (tokenRes.ok && tokenJson?.token) neonJwt = tokenJson.token;
            }
          }
        } catch { /* fall through to the cookie-forward bridge */ }

        const res = await fetch("/api/auth/neon-bridge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(neonJwt ? { token: neonJwt } : {}),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.token) throw new Error(json?.error?.message ?? "We couldn't confirm your Neon sign-in.");
        const result = await signIn("neon-bridge", { token: json.token as string, redirect: false });
        if (!alive) return;
        if (result?.error) throw new Error("The sign-in handoff failed. Please try email sign-in.");
        const next = params.get("callbackUrl");
        router.push(next && next.startsWith("/app") ? next : "/app/scan");
        router.refresh();
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "We couldn't confirm your Neon sign-in.");
      }
    })();
    return () => { alive = false; };
  }, [params, router]);

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      {error ? (
        <div className="rounded-2xl border border-warn/40 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert size={18} aria-hidden /> Sign-in needs another step</p>
          <p className="mt-2 text-sm leading-relaxed">{error}</p>
          <p className="mt-4 text-sm"><Link href="/sign-in" className="font-semibold text-accent hover:underline">Continue with email instead</Link></p>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
          <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden /> Finishing your sign-in…
        </p>
      )}
    </div>
  );
}

export default function NeonCallbackPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-5 py-16"><div className="h-32 animate-pulse rounded-3xl bg-line/50" /></div>}>
      <NeonCallbackInner />
    </Suspense>
  );
}
