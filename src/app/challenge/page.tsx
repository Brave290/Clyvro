"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ShieldCheck } from "lucide-react";

function ChallengeInner() {
  const params = useSearchParams();
  const [ok, setOk] = useState(false);
  const token = params.get("token") ?? "";

  function pass() {
    setOk(true);
    const ret = params.get("return");
    if (ret && token) {
      try {
        const dest = new URL(ret);
        dest.searchParams.set("clyvro_challenge", token);
        window.location.href = dest.toString();
        return;
      } catch { /* stay */ }
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <ShieldCheck size={22} aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl font-bold tracking-tight">Clyvro check</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        This site uses Clyvro Shield. Confirm you are a person to continue — no puzzles.
      </p>
      {ok ? (
        <p className="mt-6 rounded-2xl border border-good/30 bg-good-soft px-4 py-3 text-sm font-semibold text-good">You can close this tab.</p>
      ) : (
        <button type="button" className="button-primary mt-8 w-full" onClick={pass} disabled={!token}>
          Continue
        </button>
      )}
    </div>
  );
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<div className="px-5 py-16 text-sm text-ink-mute">Loading…</div>}>
      <ChallengeInner />
    </Suspense>
  );
}
