import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ScanError } from "@/lib/scanner/types";

/** Shared API plumbing: session requirement + error mapping. */

export interface SessionContext {
  userId: string;
  organizationId: string;
}

export class UnauthorizedError extends Error {}

export async function requireSession(): Promise<SessionContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.organizationId) {
    throw new UnauthorizedError("Sign in required.");
  }
  return { userId: session.user.id, organizationId: session.user.organizationId };
}

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION: 422,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  PLAN_LIMIT: 403,
  QUOTA_EXCEEDED: 403,
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
