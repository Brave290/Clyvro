import { createHmac, timingSafeEqual } from "node:crypto";
import { SCAN_CONFIG } from "./config";
import { ScanError } from "./types";

interface CheckpointEnvelope {
  checkpoint: string;
  issuedAt: number;
  expiresAt: number;
}

const MAX_TOKEN_CHARS = SCAN_CONFIG.maxCheckpointBytes * 4 + 8_192;

function invalidToken(): ScanError {
  return new ScanError("CHECKPOINT_INVALID", "This scan checkpoint is invalid or expired. Start a new scan or sign in to save reports.");
}

/** Sign a JSON-safe checkpoint for stateless, quota-safe public scan continuation. */
export function signScanCheckpoint(checkpoint: string, secret: string, now = Date.now()): string {
  if (!secret) throw new ScanError("SCAN_RESUME_UNAVAILABLE", "Resumable scans are not configured.");
  if (Buffer.byteLength(checkpoint, "utf8") > SCAN_CONFIG.maxCheckpointBytes) throw invalidToken();
  const envelope: CheckpointEnvelope = {
    checkpoint,
    issuedAt: now,
    expiresAt: now + SCAN_CONFIG.checkpointLifetimeMs,
  };
  const payload = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  const token = `${payload}.${signature}`;
  if (token.length > MAX_TOKEN_CHARS) throw invalidToken();
  return token;
}

/** Verify signature, size and hard expiry before a checkpoint reaches the scanner parser. */
export function verifyScanCheckpointToken(token: string, secret: string, now = Date.now()): string {
  if (!secret || typeof token !== "string" || token.length > MAX_TOKEN_CHARS) throw invalidToken();
  const separator = token.indexOf(".");
  if (separator < 1 || separator !== token.lastIndexOf(".")) throw invalidToken();
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) throw invalidToken();

  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalidToken();

  let envelope: unknown;
  try {
    envelope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw invalidToken();
  }
  if (!envelope || typeof envelope !== "object") throw invalidToken();
  const value = envelope as Partial<CheckpointEnvelope>;
  if (typeof value.checkpoint !== "string" || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)) throw invalidToken();
  if (value.issuedAt! > now + 60_000 || value.expiresAt! <= now || value.expiresAt! - value.issuedAt! !== SCAN_CONFIG.checkpointLifetimeMs) throw invalidToken();
  if (Buffer.byteLength(value.checkpoint, "utf8") > SCAN_CONFIG.maxCheckpointBytes) throw invalidToken();
  return value.checkpoint;
}
