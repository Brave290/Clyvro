"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import { Info, LoaderCircle } from "lucide-react";
import { stashAuthToast } from "@/components/AuthToast";
import type { FirebaseWebConfig } from "@/lib/firebase-auth";
import { describeGoogleSignInError, UserFacingSignInError, watchCspViolations } from "@/lib/firebase-auth-errors";

/** Official Google "G" mark (brand SVG, not a Lucide icon). */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

type Status = { google: boolean; firebase: FirebaseWebConfig | null } | null;

/**
 * "Continue with Google" — ALWAYS visible (its absence confused people).
 * Behaviour is honest about what is live:
 *  - Auth.js Google provider registered → starts Google sign-in.
 *  - Firebase configured (NEXT_PUBLIC_FIREBASE_*) → Firebase Google
 *    popup, ID token verified server-side by /api/auth/firebase-bridge.
 *  - Neither configured yet → the button explains that instead of
 *    silently hiding or pretending to work.
 */
export default function GoogleButton({ callbackUrl = "/app/scan" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getProviders().catch(() => null),
      fetch("/api/auth/providers-status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([providers, st]) => {
      if (!alive) return;
      setStatus({
        google: Boolean(providers?.google) || Boolean(st?.google),
        firebase: (st?.firebase as FirebaseWebConfig | null) ?? null,
      });
    });
    return () => { alive = false; };
  }, []);

  async function signInWithFirebase(config: FirebaseWebConfig) {
    // Lazy-loaded: the Firebase SDK only ships to browsers that actually
    // start Google sign-in, and sign-in pages never pay for it upfront.
    const { initializeApp, getApps } = await import("firebase/app");
    const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    const app = getApps().length > 0 ? getApps()[0]! : initializeApp(config);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken();
    const res = await fetch("/api/auth/firebase-bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: idToken }),
    });
    const json = (await res.json().catch(() => null)) as { token?: string; error?: { message?: string } } | null;
    if (!res.ok || !json?.token) {
      // The bridge's message is already written for the person signing in
      // (suspended account, verification failed, not configured) — keep it.
      throw new UserFacingSignInError(json?.error?.message ?? "We couldn't verify that Google sign-in. Please try again.");
    }
    const result = await signIn("firebase-bridge", { token: json.token, redirect: false });
    if (result?.error) throw new UserFacingSignInError("The sign-in handoff failed. Please try email sign-in.");
    stashAuthToast("Welcome back", "You're signed in with Google.");
    router.push(callbackUrl.startsWith("/app") ? callbackUrl : "/app/scan");
    router.refresh();
  }

  async function onClick() {
    if (status?.google) {
      setBusy(true);
      await signIn("google", { callbackUrl });
      return;
    }
    if (status?.firebase) {
      setBusy(true);
      setNotice(null);
      // Firebase only reports the downstream symptom when the page's CSP
      // blocks its loader/iframe; the violation event names the real cause.
      const cspWatch = watchCspViolations(status.firebase.authDomain);
      try {
        await signInWithFirebase(status.firebase);
      } catch (err) {
        setBusy(false);
        // Full detail for whoever is debugging — DevTools shows any CSP
        // refusal right next to this line. The notice stays plain-language.
        console.error("[GoogleButton] Google sign-in failed:", err);
        setNotice(describeGoogleSignInError(err, {
          hostname: window.location.hostname,
          authDomain: status.firebase.authDomain,
          cspViolation: cspWatch.violation(),
        }));
      } finally {
        cspWatch.stop();
      }
      return;
    }
    setNotice("Google sign-in is being switched on. For now, please continue with email — your account works exactly the same.");
  }

  return (
    <div className="mb-5">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onClick()}
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:border-accent/50 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60"
      >
        {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden /> : <GoogleMark />}
        Continue with Google
      </button>
      {notice && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-accent/25 bg-accent-soft/60 px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {notice}
        </p>
      )}
      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium text-ink-mute">or with email</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
