import { describe, expect, it } from "vitest";
import {
  describeGoogleSignInError,
  firebaseErrorCode,
  isGoogleSignInViolation,
  UserFacingSignInError,
} from "./firebase-auth-errors";

/** Shape of what @firebase/auth throws (FirebaseError: Error + code). */
function firebaseError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code, name: "FirebaseError" });
}

const CTX = { hostname: "clyvro.vercel.app", authDomain: "clyvro-prod.firebaseapp.com" };

describe("firebaseErrorCode", () => {
  it("extracts Firebase codes and ignores everything else", () => {
    expect(firebaseErrorCode(firebaseError("auth/popup-blocked"))).toBe("auth/popup-blocked");
    expect(firebaseErrorCode({ code: " AUTH/Internal-Error " })).toBe("auth/internal-error");
    expect(firebaseErrorCode(new Error("plain"))).toBe("");
    expect(firebaseErrorCode({ code: 42 })).toBe("");
    expect(firebaseErrorCode({ code: "ECONNRESET" })).toBe("");
    expect(firebaseErrorCode(null)).toBe("");
    expect(firebaseErrorCode(undefined)).toBe("");
  });
});

describe("describeGoogleSignInError — nothing is a dead end", () => {
  it("owner-side Firebase problems name the exact console setting and keep the code", () => {
    const domain = describeGoogleSignInError(firebaseError("auth/unauthorized-domain"), CTX);
    expect(domain).toContain("“clyvro.vercel.app”");
    expect(domain).toContain("Authorized domains");
    expect(domain).toContain("auth/unauthorized-domain");

    const provider = describeGoogleSignInError(firebaseError("auth/operation-not-allowed"), CTX);
    expect(provider).toContain("Sign-in method → Google");
    expect(provider).toContain("auth/operation-not-allowed");

    const config = describeGoogleSignInError(firebaseError("auth/api-key-not-valid.-please-pass-a-valid-api-key."), CTX);
    expect(config).toContain("NEXT_PUBLIC_FIREBASE_*");
    expect(config).toContain("Email sign-in works meanwhile.");
  });

  it("the two symptoms of a blocked loader/iframe point at the origins to allow, not a vague 'network hiccup'", () => {
    const internal = describeGoogleSignInError(firebaseError("auth/internal-error"), CTX);
    expect(internal).toContain("apis.google.com");
    expect(internal).toContain("clyvro-prod.firebaseapp.com");
    expect(internal).toContain("auth/internal-error");
    expect(internal).toContain("Content-Security-Policy");

    const network = describeGoogleSignInError(firebaseError("auth/network-request-failed"), CTX);
    expect(network).toContain("auth/network-request-failed");
    expect(network).toContain("apis.google.com and clyvro-prod.firebaseapp.com");
    expect(network).not.toContain("hiccup");

    // Without a known auth domain the hint still names the loader.
    expect(describeGoogleSignInError(firebaseError("auth/network-request-failed"))).toContain("allow apis.google.com for this site");
  });

  it("person-side problems say what to do, without leaking codes", () => {
    const closed = describeGoogleSignInError(firebaseError("auth/popup-closed-by-user"), CTX);
    expect(closed).toContain("Google sign-in was cancelled");
    expect(closed).not.toContain("auth/");
    expect(describeGoogleSignInError(firebaseError("auth/cancelled-popup-request"), CTX)).toBe(closed);

    expect(describeGoogleSignInError(firebaseError("auth/popup-blocked"), CTX)).toContain("Allow popups for this site");
    expect(describeGoogleSignInError(firebaseError("auth/too-many-requests"), CTX)).toContain("Wait a minute");
    expect(describeGoogleSignInError(firebaseError("auth/web-storage-unsupported"), CTX)).toContain("private browsing");
    expect(describeGoogleSignInError(firebaseError("auth/user-disabled"), CTX)).toContain("disabled");
    expect(describeGoogleSignInError(firebaseError("auth/account-exists-with-different-credential"), CTX)).toContain("different sign-in method");
  });

  it("an unmapped Firebase code is surfaced verbatim instead of flattened to the generic line", () => {
    const msg = describeGoogleSignInError(firebaseError("auth/some-brand-new-code"), CTX);
    expect(msg).toContain("auth/some-brand-new-code");
    expect(msg).toContain("continue with email");
  });

  it("our own bridge/handoff copy is shown verbatim (previously swallowed into the generic line)", () => {
    const suspended = "This account is suspended. Contact support if you think this is a mistake.";
    expect(describeGoogleSignInError(new UserFacingSignInError(suspended), CTX)).toBe(suspended);
    expect(describeGoogleSignInError(new UserFacingSignInError("Google sign-in via Firebase is not configured yet."), CTX))
      .toBe("Google sign-in via Firebase is not configured yet.");
    expect(describeGoogleSignInError(new UserFacingSignInError("The sign-in handoff failed. Please try email sign-in."), CTX))
      .toContain("handoff failed");
  });

  it("a fetch() failure after Google approved the user is explained as such; unknown errors stay honest and generic", () => {
    expect(describeGoogleSignInError(new TypeError("Failed to fetch"), CTX)).toContain("after Google approved you");
    expect(describeGoogleSignInError(new TypeError("Load failed"), CTX)).toContain("after Google approved you");
    // Technical internals never reach the person signing in.
    expect(describeGoogleSignInError(new TypeError("Cannot read properties of undefined (reading 'x')"), CTX))
      .toBe("Google sign-in didn't complete. Please try again, or continue with email.");
    expect(describeGoogleSignInError(new SyntaxError("Unexpected token <"), CTX))
      .toBe("Google sign-in didn't complete. Please try again, or continue with email.");
    expect(describeGoogleSignInError(undefined, CTX)).toContain("didn't complete");
  });

  it("an observed CSP violation is the definitive cause and wins over Firebase's downstream symptom", () => {
    const msg = describeGoogleSignInError(firebaseError("auth/network-request-failed"), {
      ...CTX,
      cspViolation: {
        directive: "frame-src",
        blockedUri: "https://clyvro-prod.firebaseapp.com/__/auth/iframe?apiKey=AIza-public&appName=%5BDEFAULT%5D",
      },
    });
    expect(msg).toContain("Content-Security-Policy blocked part of Google sign-in");
    expect(msg).toContain("frame-src refused https://clyvro-prod.firebaseapp.com/__/auth/iframe");
    expect(msg).not.toContain("apiKey="); // query string trimmed for display
    expect(msg).toContain("site configuration issue");
  });
});

describe("isGoogleSignInViolation", () => {
  it("recognises the loader, the auth iframe (default or custom domain) and Google accounts; ignores the rest", () => {
    expect(isGoogleSignInViolation("https://apis.google.com/js/api.js?onload=__iframefcb123")).toBe(true);
    expect(isGoogleSignInViolation("https://clyvro-prod.firebaseapp.com/__/auth/iframe")).toBe(true);
    expect(isGoogleSignInViolation("https://auth.clyvro.app/__/auth/iframe", "auth.clyvro.app")).toBe(true);
    expect(isGoogleSignInViolation("https://accounts.google.com/gsi/iframe")).toBe(true);
    expect(isGoogleSignInViolation("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")).toBe(true);

    expect(isGoogleSignInViolation("https://auth.clyvro.app/__/auth/iframe")).toBe(false); // custom domain only counts when configured
    expect(isGoogleSignInViolation("https://cdn.example.com/widget.js")).toBe(false);
    expect(isGoogleSignInViolation("inline")).toBe(false);
    expect(isGoogleSignInViolation("eval")).toBe(false);
    expect(isGoogleSignInViolation("")).toBe(false);
  });
});
