import { createHash, createHmac } from "node:crypto";

/**
 * Minimal Cloudflare R2 client (S3-compatible, AWS SigV4) — no SDK
 * dependency. Used for workspace/platform backup archives.
 *
 * Configuration (server-only env):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_ENDPOINT   e.g. https://<account-id>.r2.cloudflarestorage.com
 *                 (or set R2_ACCOUNT_ID and the endpoint is derived)
 * When unconfigured, r2Configured() is false and the UI says so honestly
 * instead of pretending backups exist.
 */

export interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function r2Config(): R2Config | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const endpoint = (process.env.R2_ENDPOINT?.trim() ||
    (process.env.R2_ACCOUNT_ID?.trim() ? `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com` : "")).replace(/\/$/, "");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

export const r2Configured = () => r2Config() !== null;

type FetchFn = typeof fetch;

const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

function signingKey(secret: string, dateStamp: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function signRequest(cfg: R2Config, method: string, key: string, payloadHash: string, extraHeaders: Record<string, string> = {}): SignedRequest {
  const { amzDate, dateStamp } = amzDates();
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp)).update(stringToSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: url.toString(), headers };
}

function requireConfig(fetchImpl?: FetchFn): { cfg: R2Config; doFetch: FetchFn } {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2_NOT_CONFIGURED");
  return { cfg, doFetch: fetchImpl ?? fetch };
}

export async function r2PutObject(key: string, body: string, contentType = "application/json", fetchImpl?: FetchFn): Promise<void> {
  const { cfg, doFetch } = requireConfig(fetchImpl);
  const payload = Buffer.from(body, "utf8");
  const { url, headers } = signRequest(cfg, "PUT", key, sha256Hex(payload), { "content-type": contentType });
  const res = await doFetch(url, { method: "PUT", headers, body: payload });
  if (!res.ok) throw new Error(`R2 put failed (HTTP ${res.status})`);
}

export async function r2GetObject(key: string, fetchImpl?: FetchFn): Promise<string> {
  const { cfg, doFetch } = requireConfig(fetchImpl);
  const { url, headers } = signRequest(cfg, "GET", key, sha256Hex(""));
  const res = await doFetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`R2 get failed (HTTP ${res.status})`);
  return res.text();
}

export async function r2DeleteObject(key: string, fetchImpl?: FetchFn): Promise<void> {
  const { cfg, doFetch } = requireConfig(fetchImpl);
  const { url, headers } = signRequest(cfg, "DELETE", key, sha256Hex(""));
  const res = await doFetch(url, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (HTTP ${res.status})`);
}

/** Presigned GET URL (SigV4 query signing) for time-limited downloads. */
export function r2PresignGet(key: string, expiresSec = 900): string {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2_NOT_CONFIGURED");
  const { amzDate, dateStamp } = amzDates();
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${cfg.accessKeyId}/${scope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(Math.min(Math.max(expiresSec, 60), 3600)));
  url.searchParams.set("X-Amz-SignedHeaders", "host");
  const canonicalRequest = ["GET", url.pathname, url.searchParams.toString(), `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp)).update(stringToSign).digest("hex");
  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}
