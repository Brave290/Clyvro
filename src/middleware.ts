import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/** Protects /app/* (see the authorized callback). Edge-safe config only. */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/app/:path*"],
};
