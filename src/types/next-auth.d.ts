import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Primary organization for this session (multi-org switching arrives with agency workspaces). */
      organizationId: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    organizationId?: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    organizationId?: string | null;
  }
}
