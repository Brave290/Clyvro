import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { cliDeviceCodes } from "@/lib/db/schema";
import { ScanError } from "@/lib/scanner/types";
import { SITE_API_BASE } from "@/lib/site-api-docs";
import { assertOrgHasSiteApi } from "@/lib/services/org-api";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const TTL_MS = 15 * 60_000;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;

function userCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf = randomBytes(8);
  for (let i = 0; i < 8; i += 1) s += alphabet[buf[i]! % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function startDeviceLogin(dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const deviceCode = randomBytes(24).toString("hex");
  const code = userCode();
  await db.insert(cliDeviceCodes).values({
    id: newId(),
    deviceCodeHash: sha256(deviceCode),
    userCode: code,
    status: "pending",
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return {
    device_code: deviceCode,
    user_code: code,
    verify_url: `${SITE_API_BASE}/cli/device`,
    interval: 5,
    expires_in: Math.round(TTL_MS / 1000),
  };
}

export async function lookupDeviceByUserCode(code: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  const withDash = normalized.includes("-") ? normalized : `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  const [row] = await db.select().from(cliDeviceCodes).where(eq(cliDeviceCodes.userCode, withDash)).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "That code is not valid.");
  if (row.expiresAt.getTime() < Date.now() || row.status !== "pending") {
    throw new ScanError("VALIDATION", "That code has expired or was already used. Run clyvro login again.");
  }
  return row;
}

export async function approveDeviceLogin(
  userCodeValue: string, organizationId: string, userId: string, dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  await assertOrgHasSiteApi(organizationId, db);
  const row = await lookupDeviceByUserCode(userCodeValue, db);
  await db.update(cliDeviceCodes).set({
    status: "approved",
    organizationId,
    userId,
  }).where(eq(cliDeviceCodes.id, row.id));
}

export async function pollDeviceLogin(deviceCode: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  if (!deviceCode || deviceCode.length < 16) throw new ScanError("VALIDATION", "Missing device_code.");
  const [row] = await db.select().from(cliDeviceCodes).where(eq(cliDeviceCodes.deviceCodeHash, sha256(deviceCode))).limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Unknown device login.");
  if (row.expiresAt.getTime() < Date.now() && row.status === "pending") {
    await db.update(cliDeviceCodes).set({ status: "expired" }).where(eq(cliDeviceCodes.id, row.id));
    throw new ScanError("VALIDATION", "That login code expired. Run clyvro login again.");
  }
  if (row.status === "pending") return { status: "pending" as const };
  if (row.status === "consumed" || row.status === "denied" || row.status === "expired") {
    throw new ScanError("VALIDATION", "That login is no longer available.");
  }
  const token = `clycli_${randomBytes(24).toString("hex")}`;
  await db.update(cliDeviceCodes).set({
    status: "consumed",
    tokenHash: sha256(token),
    tokenPrefix: token.slice(0, 12),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  }).where(eq(cliDeviceCodes.id, row.id));
  return { status: "approved" as const, token, token_type: "Bearer", expires_in: Math.round(TOKEN_TTL_MS / 1000) };
}
