import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { getDb } from "@/lib/db";
import { memberships, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/passwords";
import { findOrCreateOAuthUser } from "@/lib/services/accounts";

/**
 * Full Auth.js configuration (Node runtime). Credentials sign-in against
 * scrypt-hashed passwords in the users table; JWT sessions carry the
 * user id + primary organization id. Set AUTH_SECRET in production —
 * a dev-only fallback keeps zero-config local runs working.
 */
if (!process.env.AUTH_SECRET) {
  const duringBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !duringBuild) {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  // Local development / build-time only. Production MUST set AUTH_SECRET.
  process.env.AUTH_SECRET = "clyvro-dev-only-secret-change-me";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const db = await getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        // OAuth-only accounts have no password — they sign in with Google.
        if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) return null;
        const [membership] = await db
          .select()
          .from(memberships)
          .where(eq(memberships.userId, user.id))
          .limit(1);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: membership?.organizationId ?? null,
        };
      },
    }),
    // Google activates only when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are
    // set (Auth.js reads them automatically). Until then the provider
    // doesn't exist and the UI hides the button — never a dead button.
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      try {
        const provisioned = await findOrCreateOAuthUser({ email, name: user.name });
        user.id = provisioned.userId;
        user.organizationId = provisioned.organizationId;
        return true;
      } catch {
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.organizationId = user.organizationId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.organizationId = typeof token.organizationId === "string" ? token.organizationId : null;
      }
      return session;
    },
  },
});
