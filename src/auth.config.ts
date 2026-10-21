import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no database imports) shared by middleware.
 * The full config with the credentials provider lives in src/auth.ts.
 */
export const authConfig = {
  // The app is served behind platform proxies (Vercel / dev preview);
  // Auth.js requires explicit host trust outside its auto-detected hosts.
  trustHost: true,
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // Signed-in areas. /admin additionally re-checks the platform-admin
      // flag against the database row in its layout and every API route;
      // the edge only knows "has a session".
      const { pathname } = nextUrl;
      const isPrivate = pathname.startsWith("/app") || pathname === "/admin" || pathname.startsWith("/admin/");
      if (isPrivate) return !!auth?.user;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
