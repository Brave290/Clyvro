import { createHmac, randomBytes } from "node:crypto";
import { inspectRequest } from "@/lib/shield/rules";

function secret() {
  return process.env.AUTH_SECRET ?? "clyvro-dev-only-secret-change-me";
}

export type GuardAction = "allow" | "challenge" | "block";

export function guardAction(input: {
  method: string; pathname: string; search: string; userAgent: string | null;
}): { action: GuardAction; verdict: string; reason: string | null; score: number; alwaysEnforced: boolean } {
  const inspection = inspectRequest(input);
  const action: GuardAction = inspection.verdict === "block"
    ? "block"
    : inspection.verdict === "suspicious"
      ? "challenge"
      : "allow";
  return {
    action,
    verdict: inspection.verdict,
    reason: inspection.primary,
    score: inspection.score,
    alwaysEnforced: inspection.alwaysEnforced,
  };
}

export function mintChallengeToken(input: { organizationId: string; path: string; ttlSec?: number }): string {
  const exp = Math.floor(Date.now() / 1000) + (input.ttlSec ?? 300);
  const payload = Buffer.from(JSON.stringify({
    o: input.organizationId, p: input.path, e: exp, n: randomBytes(8).toString("hex"),
  })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyChallengeToken(token: string, organizationId?: string): { organizationId: string; path: string } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("bad");
  const expect = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (expect.length !== sig.length) throw new Error("bad");
  // timing-safe-ish compare
  let diff = 0;
  for (let i = 0; i < expect.length; i += 1) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) throw new Error("bad");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { o: string; p: string; e: number };
  if (typeof data.o !== "string" || typeof data.e !== "number" || data.e * 1000 < Date.now()) throw new Error("expired");
  if (organizationId && data.o !== organizationId) throw new Error("org");
  return { organizationId: data.o, path: typeof data.p === "string" ? data.p : "/" };
}
