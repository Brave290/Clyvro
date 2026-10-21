"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, LoaderCircle } from "lucide-react";

/**
 * GitHub sends users here after they install the Clyvro App (the App's
 * Setup URL points at this route). We claim the installation for the
 * signed-in workspace, then land back on the Code Reviewer.
 */
function GithubSetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const installationId = searchParams.get("installation_id") ?? "";
    if (!/^\d{1,20}$/.test(installationId)) {
      setError("GitHub didn't send an installation reference back. Start again from the Code Reviewer page.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/code-reviews/github/claim", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ installationId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't connect that installation.");
        router.replace("/app/code-reviewer?github=connected");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't connect that installation.");
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <Bot size={26} className="text-accent" aria-hidden /> Connecting GitHub…
      </h1>
      {error ? (
        <>
          <p role="alert" className="form-error mt-5">{error}</p>
          <p className="mt-4 text-sm text-ink-soft">
            <Link href="/app/code-reviewer" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">
              Back to the Code Reviewer
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-5 flex items-center gap-2 text-sm text-ink-soft" role="status">
          <LoaderCircle size={16} className="animate-spin" aria-hidden />
          Linking the installation to this workspace — one moment.
        </p>
      )}
    </div>
  );
}

export default function GithubSetupPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-lg px-5 py-16" aria-busy="true">
        <div className="text-3xl font-bold tracking-tight" aria-hidden="true">Connecting GitHub…</div>
        <div className="mt-6 h-24 animate-pulse rounded-3xl bg-line/50" />
      </div>
    }>
      <GithubSetupInner />
    </Suspense>
  );
}
