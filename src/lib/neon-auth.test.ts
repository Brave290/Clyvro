import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBridgeToken, verifyBridgeToken, verifyNeonJwt } from "./neon-auth";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
const JWKS = [{ ...jwk, kid: "test-key-1" } as never];

function signJwt(payload: Record<string, unknown>, key = privateKey): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key-1" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const signature = signer.sign(key).toString("base64url");
  return `${header}.${body}.${signature}`;
}

const NOW = 1_700_000_000_000;

describe("verifyNeonJwt", () => {
  it("accepts a correctly signed, unexpired Neon session JWT", async () => {
    const token = signJwt({ sub: "neon-user-1", email: "Person@Example.com", name: "Person", exp: Math.floor(NOW / 1000) + 600 });
    const claims = await verifyNeonJwt(token, { jwks: JWKS, now: NOW });
    expect(claims).toEqual({ sub: "neon-user-1", email: "person@example.com", name: "Person" });
  });

  it("rejects expired, tampered, and wrongly-signed tokens", async () => {
    const expired = signJwt({ sub: "u", email: "a@example.com", exp: Math.floor(NOW / 1000) - 10 });
    expect(await verifyNeonJwt(expired, { jwks: JWKS, now: NOW })).toBeNull();

    const good = signJwt({ sub: "u", email: "a@example.com", exp: Math.floor(NOW / 1000) + 600 });
    const [h, p, s] = good.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "u", email: "attacker@example.com", exp: Math.floor(NOW / 1000) + 600 })).toString("base64url");
    expect(await verifyNeonJwt(`${h}.${tamperedPayload}.${s}`, { jwks: JWKS, now: NOW })).toBeNull();
    void p;

    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const wrongKey = signJwt({ sub: "u", email: "a@example.com", exp: Math.floor(NOW / 1000) + 600 }, other.privateKey);
    expect(await verifyNeonJwt(wrongKey, { jwks: JWKS, now: NOW })).toBeNull();

    expect(await verifyNeonJwt("not-a-jwt", { jwks: JWKS, now: NOW })).toBeNull();
    const noEmail = signJwt({ sub: "u", exp: Math.floor(NOW / 1000) + 600 });
    expect(await verifyNeonJwt(noEmail, { jwks: JWKS, now: NOW })).toBeNull();
  });
});

describe("bridge tokens", () => {
  it("round-trip, expire, and resist tampering", () => {
    const token = createBridgeToken("user-1", "a@example.com", NOW);
    expect(verifyBridgeToken(token, NOW + 1000)).toEqual({ userId: "user-1", email: "a@example.com" });
    expect(verifyBridgeToken(token, NOW + 6 * 60 * 1000)).toBeNull();
    expect(verifyBridgeToken(`${token}x`, NOW + 1000)).toBeNull();
  });
});
