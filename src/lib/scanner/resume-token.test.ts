import { describe, expect, it } from "vitest";
import { SCAN_CONFIG } from "./config";
import { signScanCheckpoint, verifyScanCheckpointToken } from "./resume-token";

describe("public scan resume tokens", () => {
  const secret = "unit-test-secret-that-is-never-used-in-production";
  const checkpoint = JSON.stringify({ version: 2, target: "https://example.com/", locale: "en-NG" });

  it("round-trips a signed checkpoint within its expiry window", () => {
    const issuedAt = 1_000_000;
    const token = signScanCheckpoint(checkpoint, secret, issuedAt);
    expect(verifyScanCheckpointToken(token, secret, issuedAt + 1)).toBe(checkpoint);
  });

  it("rejects modified payloads and a different secret", () => {
    const token = signScanCheckpoint(checkpoint, secret, 1_000_000);
    const [payload, signature] = token.split(".");
    const tampered = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`;
    expect(() => verifyScanCheckpointToken(tampered, secret, 1_000_001)).toThrow();
    expect(() => verifyScanCheckpointToken(token, `${secret}-other`, 1_000_001)).toThrow();
  });

  it("rejects expired checkpoints", () => {
    const issuedAt = 1_000_000;
    const token = signScanCheckpoint(checkpoint, secret, issuedAt);
    expect(() => verifyScanCheckpointToken(token, secret, issuedAt + SCAN_CONFIG.checkpointLifetimeMs + 1)).toThrow();
  });
});
