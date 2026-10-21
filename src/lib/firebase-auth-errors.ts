/**
 * Plain-language messages for everything that can go wrong between
 * "Continue with Google" and a signed-in session.
 *
 * Browser-safe and dependency-free on purpose: GoogleButton imports it,
 * and src/lib/firebase-auth.ts cannot be imported client-side (node:crypto).
 *
 * Three kinds of failure, three treatments:
 *  - Firebase Auth errors (`code: "auth/…"`) → a specific next step per
 *    code. Owner-side problems (provider disabled, domain not authorised,
 *    config rejected, blocked loader/iframe) name the exact console
 *    setting or origin and keep the raw code, so a screenshot is enough
 *    to act on. Person-side problems (popup closed, popups blocked) just
 *    say what to do.
 *  - Our own bridge/handoff responses already carry copy written for the
 *    person signing in (suspended account, verification failed, not
 *    configured) → shown verbatim via UserFacingSignInError. These used
 *    to be flattened into one generic line.
 *  - Anything else → still honest: the generic line plus the raw code
 *    when there is one. No failure is a dead end.
 */

export interface CspViolationSummary {
  /** e.g. "script-src" or "frame-src" (effective directive). */
  directive: string;
  /** What the browser refused to load (query string stripped for display). */
  blockedUri: string;
}

export interface GoogleSignInErrorContext {
  /** window.location.hostname — named in the unauthorized-domain guidance. */
  hostname?: string;
  /** NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN — named in blocker guidance. */
  authDomain?: string;
  /** A CSP violation observed during this attempt (watchCspViolations). Definitive when present. */
  cspViolation?: CspViolationSummary | null;
}

/** An error whose message is already written for the person signing in. */
export class UserFacingSignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingSignInError";
  }
}

const EMAIL_FALLBACK = "Email sign-in works meanwhile.";

/** Firebase error code ("auth/popup-blocked") or "" when the error isn't a Firebase one. */
export function firebaseErrorCode(err: unknown): string {
  const raw = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof raw !== "string") return "";
  const code = raw.trim().toLowerCase();
  return /^[a-z]+\/[a-z0-9.-]+$/.test(code) ? code : "";
}

function blockerHint(ctx: GoogleSignInErrorContext): string {
  const origins = ["apis.google.com", ...(ctx.authDomain ? [ctx.authDomain] : [])];
  return `If you use an ad or privacy blocker, allow ${origins.join(" and ")} for this site`;
}

type Rule = { match: readonly string[]; message: (code: string, ctx: GoogleSignInErrorContext) => string };

/** First match wins — order specific codes before broad ones. */
const RULES: readonly Rule[] = [
  {
    match: ["popup-closed-by-user", "cancelled-popup-request", "user-cancelled"],
    message: () => "The Google window closed before sign-in finished. Click “Continue with Google” again and complete the sign-in in that window.",
  },
  {
    match: ["popup-blocked"],
    message: () => "Your browser blocked the Google sign-in popup. Allow popups for this site (look for the blocked-popup icon in the address bar), then try again.",
  },
  {
    match: ["unauthorized-domain"],
    message: (code, ctx) =>
      `Google sign-in isn't authorised for ${ctx.hostname ? `“${ctx.hostname}”` : "this website's domain"} yet — the site owner needs to add it in Firebase Console → Authentication → Settings → Authorized domains (${code}). ${EMAIL_FALLBACK}`,
  },
  {
    match: ["operation-not-allowed"],
    message: (code) =>
      `Google isn't enabled as a sign-in method in this Firebase project — the site owner needs to turn it on in Firebase Console → Authentication → Sign-in method → Google (${code}). ${EMAIL_FALLBACK}`,
  },
  {
    match: ["admin-restricted-operation"],
    message: (code) =>
      `Firebase refused this sign-in as an admin-restricted operation — the site owner needs to review the project's sign-in restrictions (${code}). ${EMAIL_FALLBACK}`,
  },
  {
    match: ["invalid-api-key", "api-key-not-valid", "configuration-not-found", "app-not-authorized", "invalid-app-id", "project-not-found", "app-deleted"],
    message: (code) =>
      `Google rejected this site's Firebase configuration — the site owner needs to check the NEXT_PUBLIC_FIREBASE_* values against Firebase Console → Project settings → Your apps (${code}). ${EMAIL_FALLBACK}`,
  },
  {
    match: ["user-disabled"],
    message: () => "This Google account has been disabled for this app. Contact support if you think that's a mistake.",
  },
  {
    match: ["account-exists-with-different-credential", "credential-already-in-use", "email-already-in-use"],
    message: () => "An account with this email already uses a different sign-in method. Sign in with email (or the method you used before) and you'll land in the same workspace.",
  },
  {
    match: ["too-many-requests"],
    message: () => "Too many sign-in attempts in a short time. Wait a minute, then try again.",
  },
  {
    match: ["web-storage-unsupported"],
    message: () => "Google sign-in needs browser storage (cookies / site data) that this browser is blocking — usually private browsing or a strict privacy setting. Allow it for this site, or continue with email.",
  },
  {
    match: ["internal-error"],
    message: (code, ctx) =>
      `Google's sign-in script (apis.google.com) couldn't load in this browser (${code}). ${blockerHint(ctx)}, then try again. If it keeps happening, the site owner needs to check the site's Content-Security-Policy. ${EMAIL_FALLBACK}`,
  },
  {
    match: ["network-request-failed", "timeout"],
    message: (code, ctx) =>
      `Google sign-in couldn't reach Google (${code}). Check your connection. ${blockerHint(ctx)}, then try again. ${EMAIL_FALLBACK}`,
  },
  {
    match: ["invalid-credential", "user-token-expired", "invalid-user-token", "user-mismatch", "null-user"],
    message: () => "Google returned a credential this site couldn't use — it may have expired mid-flow. Please try again.",
  },
];

function displayUri(uri: string): string {
  try {
    const u = new URL(uri);
    return `${u.origin}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return uri;
  }
}

/**
 * The message GoogleButton shows after a failed attempt. Never generic
 * when there is anything more specific to say.
 */
export function describeGoogleSignInError(err: unknown, ctx: GoogleSignInErrorContext = {}): string {
  if (ctx.cspViolation) {
    const { directive, blockedUri } = ctx.cspViolation;
    return `This site's Content-Security-Policy blocked part of Google sign-in (${directive} refused ${displayUri(blockedUri)}). That's a site configuration issue, not your browser — the site owner needs to allow Google's sign-in origins in the policy. ${EMAIL_FALLBACK}`;
  }

  const code = firebaseErrorCode(err);
  if (code) {
    const rule = RULES.find((r) => r.match.some((fragment) => code.includes(fragment)));
    if (rule) return rule.message(code, ctx);
    return `Google sign-in failed with ${code}. Please try again, or continue with email.`;
  }

  if (err instanceof UserFacingSignInError && err.message.trim()) return err.message;

  // fetch() rejecting = the bridge call never reached us ("Failed to fetch",
  // "NetworkError when attempting to fetch resource.", Safari's "Load failed").
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return "We couldn't reach the sign-in server after Google approved you. Check your connection and try again — your Google account is fine.";
  }

  return "Google sign-in didn't complete. Please try again, or continue with email.";
}

/* ---------------- CSP violation watch (browser only) ---------------- */

/** True when a blocked URI belongs to Google sign-in (gapi loader, auth-domain iframe, Google accounts). */
export function isGoogleSignInViolation(blockedUri: string, authDomain?: string): boolean {
  let host = "";
  try {
    host = new URL(blockedUri).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  const configured = authDomain?.trim().toLowerCase();
  if (configured && host === configured) return true;
  return (
    host === "apis.google.com" ||
    host === "accounts.google.com" ||
    host.endsWith(".firebaseapp.com") ||
    host.endsWith(".googleapis.com")
  );
}

export interface CspViolationWatch {
  /** The first relevant violation seen since start, if any. */
  violation(): CspViolationSummary | null;
  stop(): void;
}

/**
 * Listen for `securitypolicyviolation` while a sign-in attempt runs.
 * Firebase only ever reports the downstream symptom (internal-error /
 * network-request-failed); the violation event names the real cause.
 * Safe to call during SSR (no-op).
 */
export function watchCspViolations(authDomain?: string): CspViolationWatch {
  if (typeof document === "undefined") {
    return { violation: () => null, stop: () => undefined };
  }
  let seen: CspViolationSummary | null = null;
  const onViolation = (event: Event) => {
    if (seen) return;
    const e = event as SecurityPolicyViolationEvent;
    const blockedUri = String(e.blockedURI ?? "");
    if (!isGoogleSignInViolation(blockedUri, authDomain)) return;
    seen = { directive: e.effectiveDirective || e.violatedDirective || "content-security-policy", blockedUri };
  };
  document.addEventListener("securitypolicyviolation", onViolation);
  return {
    violation: () => seen,
    stop: () => document.removeEventListener("securitypolicyviolation", onViolation),
  };
}
