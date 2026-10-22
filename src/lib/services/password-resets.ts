import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { passwordResets, users } from "@/lib/db/schema";
import { hashPassword, passwordProblem } from "@/lib/passwords";
import { sendMail, type MailResult, type MailSender } from "@/lib/mail";
import { passwordResetEmail } from "@/lib/email/templates";
import { ScanError } from "@/lib/scanner/types";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export interface ResetRequestOutcome {
  /** Raw token — service-level only (tests); the API never exposes it. */
  token: string | null;
  mail: MailResult | "no-account";
}

/**
 * Start a password reset. Deliberately indistinguishable to callers
 * whether the email belongs to an account: no row and no mail for
 * unknown emails (and for OAuth-only accounts, which sign in with
 * their provider instead). A fresh request invalidates earlier links.
 */
export async function requestPasswordReset(
  emailRaw: string,
  opts: { baseUrl?: string; send?: MailSender } = {},
  dbOverride?: DB,
): Promise<ResetRequestOutcome> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { token: null, mail: "no-account" };
  const db = dbOverride ?? (await getDb());
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.passwordHash) return { token: null, mail: "no-account" };

  const now = new Date();
  await db
    .update(passwordResets)
    .set({ usedAt: now })
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

  const token = randomBytes(32).toString("hex");
  await db.insert(passwordResets).values({
    id: newId(),
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  });

  const base = (opts.baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/$/, "");
  const link = `${base}/reset-password?token=${token}`;
  const mail = await (opts.send ?? sendMail)({ to: user.email, ...passwordResetEmail(link) });
  return { token, mail };
}

/**
 * Complete a reset. Generic failure for unknown/used/expired tokens so
 * a guessed token learns nothing; the row is burned on success and any
 * other outstanding links for that user are invalidated too.
 */
export async function resetPassword(rawToken: string, newPassword: string, dbOverride?: DB): Promise<{ userId: string }> {
  const problem = passwordProblem(newPassword);
  if (problem) throw new ScanError("VALIDATION", problem);
  const token = rawToken.trim();
  if (!token) throw new ScanError("RESET_INVALID", "This reset link is invalid or has expired. Request a new one.");

  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, hashToken(token))).limit(1);
  const now = new Date();
  if (!row || row.usedAt || row.expiresAt.getTime() <= now.getTime()) {
    throw new ScanError("RESET_INVALID", "This reset link is invalid or has expired. Request a new one.");
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, row.userId));
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, row.userId), isNull(passwordResets.usedAt)));
  });
  return { userId: row.userId };
}
