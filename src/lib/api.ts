import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema";
import { normalizeRole, canManageOrg, canWrite, type Role } from "@/lib/permissions";
import { ScanError } from "@/lib/scanner/types";

/** Shared API plumbing: session/org resolution, role guards, error mapping. */

/** Selected-organization cookie (validated against memberships server-side on every request). */
export const ORG_COOKIE = "clyvro-org";

export interface SessionContext {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
}

export class UnauthorizedError extends Error {}

/**
 * Resolves the signed-in user's active organization + role from the
 * database (never trusting the client): the org cookie wins when the
 * user is a member of it, then the JWT's primary org, then any
 * membership. Throws UnauthorizedError when signed out / org-less.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError("Sign in required.");
  const db = await getDb();
  const rows = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, session.user.id));
  if (rows.length === 0) throw new UnauthorizedError("Sign in required.");

  const cookieOrg = (await cookies()).get(ORG_COOKIE)?.value;
  const active =
    rows.find((m) => m.organizationId === cookieOrg) ??
    rows.find((m) => m.organizationId === session.user.organizationId) ??
    rows[0];

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    organizationId: active.organizationId,
    role: normalizeRole(active.role),
  };
}

export const requireSession = getSessionContext;

/** Throws 403 unless the role may perform day-to-day mutations. */
export function requireWrite(ctx: SessionContext): void {
  if (!canWrite(ctx.role)) {
    throw new ScanError("FORBIDDEN", "Your role is read-only. Ask an admin if you need to make changes.");
  }
}

/** Throws 403 unless the role may manage settings/members. */
export function requireManage(ctx: SessionContext): void {
  if (!canManageOrg(ctx.role)) {
    throw new ScanError("FORBIDDEN", "Only owners and admins can do that.");
  }
}

/** Best-effort client IP from proxy headers (first hop). Used for rate limits/abuse claims only. */
export function clientIp(req: Request): string {
  // Prefer Vercel's authoritative header if present
  const vercelIp = req.headers.get("x-vercel-ip");
  if (vercelIp) return vercelIp.trim();
  
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  FREE_SCAN_USED: 403,
  PLAN_LIMIT: 403,
  QUOTA_EXCEEDED: 403,
  CONSENT_REQUIRED: 403,
  DOMAIN_NOT_VERIFIED: 403,
  NOT_IMPLEMENTED: 501,
  INVALID_URL: 400,
  BLOCKED_PROTOCOL: 400,
  BLOCKED_CREDENTIALS: 400,
  BLOCKED_PORT: 400,
  BLOCKED_HOST: 400,
  BLOCKED_IP: 400,
  DNS_FAILED: 400,
};

export function apiError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: err.message } }, { status: 401 });
  }
  if (err instanceof ScanError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: STATUS_BY_CODE[err.code] ?? 400 },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

export async function readJsonBody(req: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ScanError("VALIDATION", "Request too large.");
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ScanError("VALIDATION", "Send a JSON object.");
  }
}
