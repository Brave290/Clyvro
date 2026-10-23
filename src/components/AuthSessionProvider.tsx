"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/**
 * Makes the Auth.js session available on every public page (nav, homepage
 * CTAs, pricing). The server passes the current session so the first paint
 * already knows if you're signed in — no flash of "Sign in".
 * refetchOnWindowFocus keeps the chrome in sync if you sign in/out in another tab.
 */
export default function AuthSessionProvider({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus refetchInterval={5 * 60}>
      {children}
    </SessionProvider>
  );
}
