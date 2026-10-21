import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBridgeToken, verifyBridgeToken, verifyFirebaseIdToken } from "./firebase-auth";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
const JWKS = [{ ...jwk, kid: "test-key-1" } as never];

const PROJECT = "clyvro-test-project";
const NOW = 1_700_000_000_000;
const NOW_SEC = Math.floor(NOW / 1000);

function signJwt(payload: Record<string, unknown>, key = privateKey): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key-1" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const signature = signer.sign(key).toString("base64url");
  return `${header}.${body}.${signature}`;
}

const validPayload = {
  sub: "firebase-user-1",
  email: "Person@Example.com",
  name: "Person",
  email_verified: true,
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  iat: NOW_SEC - 10,
  exp: NOW_SEC + 600,
};

describe("verifyFirebaseIdToken", () => {
  it("accepts a correctly signed, unexpired Firebase ID token for this project", async () => {
    const token = signJwt(validPayload);
    const claims = await verifyFirebaseIdToken(token, { jwks: JWKS, now: NOW, projectId: PROJECT });
    expect(claims).toEqual({ sub: "firebase-user-1", email: "person@example.com", name: "Person" });
  });

  it("rejects expired, tampered, and wrongly-signed tokens", async () => {
    const expired = signJwt({ ...validPayload, exp: NOW_SEC - 10 });
    expect(await verifyFirebaseIdToken(expired, { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    const good = signJwt(validPayload);
    const [h, , s] = good.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...validPayload, email: "attacker@example.com" })).toString("base64url");
    expect(await verifyFirebaseIdToken(`${h}.${tamperedPayload}.${s}`, { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const wrongKey = signJwt(validPayload, other.privateKey);
    expect(await verifyFirebaseIdToken(wrongKey, { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    expect(await verifyFirebaseIdToken("not-a-jwt", { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();
  });

  it("rejects tokens for another project, wrong issuer, unverified email, and missing email", async () => {
    const otherProject = signJwt({ ...validPayload, aud: "someone-else", iss: "https://securetoken.google.com/someone-else" });
    expect(await verifyFirebaseIdToken(otherProject, { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    const wrongIss = signJwt({ ...validPayload, iss: "https://evil.example.com" });
    expect(await verifyFirebaseIdToken(wrongIss, { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    const unverified = signJwt({ ...validPayload, email_verified: false });
    expect(await verifyFirebaseIdToken(unverified, { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    const noEmail: Record<string, unknown> = { ...validPayload };
    delete noEmail.email;
    expect(await verifyFirebaseIdToken(signJwt(noEmail), { jwks: JWKS, now: NOW, projectId: PROJECT })).toBeNull();

    // No project configured server-side → nothing verifies.
    expect(await verifyFirebaseIdToken(signJwt(validPayload), { jwks: JWKS, now: NOW, projectId: "" })).toBeNull();
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
